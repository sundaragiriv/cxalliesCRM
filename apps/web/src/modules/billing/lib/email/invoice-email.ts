/**
 * Invoice email body builder. Returns the matched HTML + text bodies +
 * subject for an invoice send. Pure — no DB, no env, no fetch — so it's
 * easy to snapshot-test and swap a body without touching the action.
 *
 * The "view in browser" link points at a signed R2 URL with a 30-day
 * TTL (per ADR-0006 §6.3). Phase 2 replaces this with an auth-checked
 * route handler — see PROGRESS.md §7.
 */

export type InvoiceEmailInput = {
  brandDisplayName: string
  orgLegalName: string
  invoiceNumber: string
  totalDisplay: string
  dueDate: string
  billToDisplayName: string
  /** Signed R2 URL — viewable in any browser, valid for ~30 days. */
  pdfViewUrl: string
  /** Hex color for the CTA button + heading accent in the HTML body. */
  accentHex: string
  /** Optional sender notes pulled from invoice.notes. */
  notes: string | null
}

export type InvoiceEmail = {
  subject: string
  htmlBody: string
  textBody: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildInvoiceEmail(input: InvoiceEmailInput): InvoiceEmail {
  const subject = `Invoice ${input.invoiceNumber} from ${input.brandDisplayName} — ${input.totalDisplay} due ${input.dueDate}`

  const greeting = `Hi ${escapeHtml(input.billToDisplayName)},`
  const summarySentence = `${escapeHtml(input.brandDisplayName)} has sent you invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> for <strong>${escapeHtml(input.totalDisplay)}</strong>, due ${escapeHtml(input.dueDate)}.`
  const ctaLabel = 'View invoice'
  const noteBlock = input.notes
    ? `<p style="margin:24px 0 0 0;padding:12px 16px;border-left:3px solid ${escapeHtml(input.accentHex)};background:#f9fafb;color:#374151;font-size:14px;line-height:1.5;">${escapeHtml(input.notes)}</p>`
    : ''

  const htmlBody = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="height:6px;background:${escapeHtml(input.accentHex)};"></td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <h1 style="margin:0;font-size:18px;color:${escapeHtml(input.accentHex)};">${escapeHtml(input.brandDisplayName)}</h1>
                <p style="margin:4px 0 0 0;font-size:12px;color:#6b7280;">${escapeHtml(input.orgLegalName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;">${greeting}</p>
                <p style="margin:0;font-size:15px;line-height:1.5;">${summarySentence}</p>
                ${noteBlock}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 8px 32px;">
                <a href="${escapeHtml(input.pdfViewUrl)}"
                   style="display:inline-block;padding:12px 24px;background:${escapeHtml(input.accentHex)};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
                  ${ctaLabel}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px 32px;">
                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;text-align:center;">
                  The PDF is attached to this email. The link above stays live for one week — after that, open the attachment or reply to request a fresh link.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #f3f4f6;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">
                  Reply to this email with questions about ${escapeHtml(input.invoiceNumber)}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const textBody = [
    `Hi ${input.billToDisplayName},`,
    '',
    `${input.brandDisplayName} has sent you invoice ${input.invoiceNumber} for ${input.totalDisplay}, due ${input.dueDate}.`,
    '',
    input.notes ? `Note from sender:\n${input.notes}\n` : null,
    `View invoice: ${input.pdfViewUrl}`,
    '',
    'The PDF is attached to this email. The link above stays live for one week.',
    '',
    `— ${input.brandDisplayName} (${input.orgLegalName})`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  return { subject, htmlBody, textBody }
}
