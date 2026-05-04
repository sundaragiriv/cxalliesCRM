/**
 * Postmark transactional-email wrapper.
 *
 * Direct fetch against https://postmarkapp.com/email — chosen over the
 * `postmark` SDK to keep the dependency surface small and the typed-error
 * handling under our control. Phase 1 covers the `POST /email` endpoint
 * with attachments. Templates / batch sends / inbound / bounces feed in
 * later phases as needed.
 *
 * Postmark error semantics (https://postmarkapp.com/developer/api/overview#error-codes):
 *   ErrorCode 0           — success (HTTP 200, ErrorCode field still present)
 *   ErrorCode 10          — bad/missing API token
 *   ErrorCode 300         — invalid email request (malformed address, etc.)
 *   ErrorCode 400         — sender signature not confirmed
 *   ErrorCode 405         — sender signature for the From address not found
 *   ErrorCode 406         — recipient address bounced or marked as bad
 *   ErrorCode 412         — recipient address is on the inactive list
 *   ErrorCode 422         — message contains invalid attachments
 *
 * The wrapper distinguishes:
 *   - `transient` errors (network, 5xx, ErrorCode 10/100) — caller may retry
 *   - `recipient` errors (406, 412, 300 with bad address) — caller must NOT
 *     retry the same recipient; surface to the user to fix the address
 *   - `config` errors (400, 405) — caller must NOT retry; ops fix needed
 *
 * Magic dev token: `POSTMARK_API_TEST` returns a synthetic 200 + message ID
 * without sending real email. Useful for verify scripts and unit tests.
 */

import { env } from '@/lib/env'
import type { EmailIdentity } from './from-org'

const POSTMARK_ENDPOINT = 'https://api.postmarkapp.com/email'

export type PostmarkAttachment = {
  /** Filename as the recipient sees it. */
  Name: string
  /** Base64-encoded file contents. */
  Content: string
  /** MIME type, e.g. 'application/pdf'. */
  ContentType: string
  /** Optional Content-ID for inline images; omit for normal attachments. */
  ContentID?: string
}

export type PostmarkSendInput = {
  /**
   * Resolved From identity for this organization. Per ADR-0007, the
   * caller looks this up via `getEmailIdentity(tx, orgId)` inside its
   * transaction so a misconfigured org fails before the action commits.
   */
  identity: EmailIdentity
  /**
   * Phase 2 seam for per-brand sender. When `brands` gains
   * `email_sender_address`, callers will resolve the brand-level identity
   * and pass it here; today this parameter is accepted but the wrapper
   * does not branch on it (the override, when set, simply replaces the
   * `identity` payload's address/name pair). Leaving the seam in place
   * avoids a sendInvoice signature churn in Phase 2.
   */
  fromOverride?: { fromAddress: string; fromName: string }
  to: string
  subject: string
  htmlBody: string
  textBody: string
  attachments?: PostmarkAttachment[]
  /** Optional reply-to override; defaults to the resolved From address. */
  replyTo?: string
  /** Tag for Postmark dashboard filtering — use the action name, e.g. 'invoice-send'. */
  tag?: string
  /** Extra metadata for Postmark webhooks; values must be strings. */
  metadata?: Record<string, string>
}

type PostmarkSuccess = {
  ok: true
  messageID: string
  submittedAt: string
  to: string
}

type PostmarkErrorKind = 'transient' | 'recipient' | 'config' | 'invalid_request'

type PostmarkFailure = {
  ok: false
  kind: PostmarkErrorKind
  errorCode: number
  message: string
  /** Whether the caller may safely retry this exact request. */
  retriable: boolean
  /** Best-effort recipient address echo for logging / display. */
  to: string
}

export type PostmarkResult = PostmarkSuccess | PostmarkFailure

type PostmarkRawResponse = {
  ErrorCode?: number
  Message?: string
  MessageID?: string
  SubmittedAt?: string
  To?: string
}

function classify(errorCode: number): {
  kind: PostmarkErrorKind
  retriable: boolean
} {
  // https://postmarkapp.com/developer/api/overview#error-codes
  switch (errorCode) {
    case 10: // bad token
    case 100: // maintenance
      return { kind: 'transient', retriable: true }
    case 400: // sender signature not confirmed
    case 405: // sender signature for from address not found
    case 411: // server doesn't allow message stream
      return { kind: 'config', retriable: false }
    case 406: // recipient inactive (hard bounce / spam complaint)
    case 412: // recipient on inactive list
      return { kind: 'recipient', retriable: false }
    case 300: // invalid email request (most often: malformed To address)
      return { kind: 'invalid_request', retriable: false }
    case 422: // invalid attachments
      return { kind: 'invalid_request', retriable: false }
    default:
      return { kind: 'transient', retriable: true }
  }
}

export async function sendEmail(input: PostmarkSendInput): Promise<PostmarkResult> {
  // Per ADR-0007: From identity is org-scoped (via input.identity), not env-driven.
  // The fromOverride seam reserves the Phase 2 per-brand sender path; today it
  // simply substitutes for identity.fromAddress / .fromName when provided.
  const fromAddress = input.fromOverride?.fromAddress ?? input.identity.fromAddress
  const fromName = input.fromOverride?.fromName ?? input.identity.fromName
  const from = `${fromName} <${fromAddress}>`

  const payload = {
    From: from,
    To: input.to,
    Subject: input.subject,
    HtmlBody: input.htmlBody,
    TextBody: input.textBody,
    MessageStream: input.identity.messageStream,
    ReplyTo: input.replyTo ?? fromAddress,
    Tag: input.tag,
    Metadata: input.metadata,
    Attachments: input.attachments,
    TrackOpens: false,
    TrackLinks: 'None' as const,
  }

  let response: Response
  try {
    response = await fetch(POSTMARK_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    return {
      ok: false,
      kind: 'transient',
      errorCode: -1,
      message: `Postmark fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      retriable: true,
      to: input.to,
    }
  }

  let body: PostmarkRawResponse
  try {
    body = (await response.json()) as PostmarkRawResponse
  } catch {
    return {
      ok: false,
      kind: 'transient',
      errorCode: -1,
      message: `Postmark returned non-JSON response (HTTP ${response.status})`,
      retriable: response.status >= 500,
      to: input.to,
    }
  }

  // Postmark returns 200 + ErrorCode 0 on success.
  if (response.ok && body.ErrorCode === 0 && body.MessageID) {
    return {
      ok: true,
      messageID: body.MessageID,
      submittedAt: body.SubmittedAt ?? new Date().toISOString(),
      to: body.To ?? input.to,
    }
  }

  const errorCode = body.ErrorCode ?? response.status
  const { kind, retriable } = classify(errorCode)

  return {
    ok: false,
    kind,
    errorCode,
    message: body.Message ?? `HTTP ${response.status}`,
    retriable,
    to: input.to,
  }
}
