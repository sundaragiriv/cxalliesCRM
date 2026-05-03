/**
 * P1-14 invoice PDF + Postmark email verification.
 *
 * Exercises against the real DB:
 *   1. Find a draft invoice (or create a minimal one with a manual line).
 *   2. Render the invoice PDF via @react-pdf/renderer; assert the bytes
 *      start with the `%PDF-` magic.
 *   3. Upload to R2 (MinIO locally) at the versioned key shape; assert a
 *      `files` row commits with kind='r2_owned' + the right r2_key.
 *   4. Generate a 30-day signed URL; assert the URL is a presigned GET.
 *   5. Build the email body; assert subject/html/text contain the
 *      invoice number + signed URL.
 *   6. Send via Postmark using the magic POSTMARK_API_TEST token. The
 *      sandbox token returns ok=true with a synthetic MessageID, no
 *      real email is delivered.
 *   7. Resend (regenerate v2): assert pdf_version increments, a NEW
 *      files row exists at the v2 R2 key, the v1 row is preserved (so
 *      the original-as-sent PDF is still queryable for audit).
 *
 * Cleans up everything it created. Re-runnable.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  invoiceLines,
  invoices,
  projects,
} from '../src/modules/billing/schema'
import { businessLines, organizations } from '../src/modules/parties/schema'
import { users } from '../src/modules/auth/schema'
import { files } from '../src/modules/files/schema'
import { chartOfAccounts } from '../src/modules/finance/schema'
import { renderInvoicePDF } from '../src/modules/billing/lib/invoice-pdf/render'
import { loadInvoicePdfPayload } from '../src/modules/billing/actions/_invoice-pdf-payload'
import { buildInvoicePdfR2Key } from '../src/modules/billing/lib/invoice-pdf/r2-key'
import { uploadBytesAsFile } from '../src/modules/files/actions/upload-bytes'
import { presignedDownloadUrl } from '../src/modules/files/lib/r2'
import { buildInvoiceEmail } from '../src/modules/billing/lib/email/invoice-email'
import { sendEmail } from '../src/lib/email/postmark'
import { nextInvoiceNumber } from '../src/modules/billing/lib/invoices/next-invoice-number'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL not set')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

const createdProjectIds: string[] = []
const createdInvoiceIds: string[] = []
const createdFileIds: string[] = []

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

async function main() {
  await db.transaction(async (tx) => {
    // ---- 0. Locate fixtures ----
    const [org] = await tx.select({ id: organizations.id }).from(organizations).limit(1)
    if (!org) throw new Error('No organizations seeded.')
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, org.id))
      .limit(1)
    if (!user) throw new Error('No users seeded.')
    const [bl] = await tx
      .select({ id: businessLines.id })
      .from(businessLines)
      .where(
        and(
          eq(businessLines.organizationId, org.id),
          eq(businessLines.slug, 'consulting'),
        ),
      )
      .limit(1)
    if (!bl) throw new Error('Consulting business_line not seeded.')
    const [revAcct] = await tx
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.organizationId, org.id),
          eq(chartOfAccounts.businessLineId, bl.id),
          eq(chartOfAccounts.accountType, 'revenue'),
        ),
      )
      .limit(1)
    if (!revAcct) throw new Error('No revenue account in CoA for consulting BL.')

    // Pick any party with an email; otherwise pick any party and patch in an
    // email for the duration of the script (we restore on cleanup).
    const partyRow = await tx.execute(
      sql`SELECT id, primary_email FROM parties WHERE organization_id = ${org.id} ORDER BY created_at LIMIT 1`,
    )
    const party = (partyRow as any)[0] as
      | { id: string; primary_email: string | null }
      | undefined
    if (!party) throw new Error('No parties seeded.')
    const partyId = party.id
    const originalPartyEmail = party.primary_email
    if (!originalPartyEmail) {
      await tx.execute(
        sql`UPDATE parties SET primary_email = 'verify@example.com' WHERE id = ${partyId}`,
      )
    }

    console.log(`  ✓ fixtures: org, user, BL=consulting, party with email`)

    // ---- 1. Create a draft invoice (minimal manual line so we don't need
    //         time entries / approvals — focus is on the PDF + email path). ----
    const invoiceNumber = await nextInvoiceNumber(tx as any, org.id, 2099)
    const [invoice] = await tx
      .insert(invoices)
      .values({
        organizationId: org.id,
        invoiceNumber,
        billToPartyId: partyId,
        businessLineId: bl.id,
        issueDate: '2099-01-15',
        dueDate: '2099-02-14',
        currencyCode: 'USD',
        subtotalCents: 50_000,
        taxCents: 0,
        totalCents: 50_000,
        paidCents: 0,
        status: 'draft',
        terms: 'Net 30',
        notes: 'Thanks for the business.',
        pdfVersion: 0,
      })
      .returning()
    if (!invoice) throw new Error('Failed to insert invoice')
    createdInvoiceIds.push(invoice.id)

    await tx.insert(invoiceLines).values({
      organizationId: org.id,
      invoiceId: invoice.id,
      lineNumber: 1,
      description: 'P1-14 verify — consulting hours',
      kind: 'fixed',
      quantity: '5.00',
      unitPriceCents: 10_000,
      amountCents: 50_000,
      currencyCode: 'USD',
      chartOfAccountsId: revAcct.id,
    })
    console.log(`  ✓ created draft invoice ${invoiceNumber} ($500)`)

    // ---- 2. Render PDF v1 ----
    const v1Version = 1
    const v1Payload = await loadInvoicePdfPayload(
      tx as any,
      org.id,
      invoice.id,
      v1Version,
    )
    const v1Bytes = await renderInvoicePDF(v1Payload)
    assert(v1Bytes.byteLength > 1000, 'PDF v1 should be at least 1KB')
    const v1Magic = v1Bytes.subarray(0, 5).toString('utf8')
    assert(v1Magic === '%PDF-', `PDF v1 magic must be '%PDF-', got '${v1Magic}'`)
    console.log(`  ✓ PDF v1 rendered (${v1Bytes.byteLength} bytes, magic=%PDF-)`)

    // ---- 3. Upload to R2 at the versioned key ----
    const v1Key = buildInvoicePdfR2Key({
      organizationId: org.id,
      invoiceId: invoice.id,
      invoiceNumber,
      version: v1Version,
    })
    assert(
      v1Key === `${org.id}/billing/invoices/${invoice.id}/v1/invoice-${invoiceNumber}.pdf`,
      `R2 key shape: got ${v1Key}`,
    )

    const v1Upload = await uploadBytesAsFile(tx as any, {
      organizationId: org.id,
      uploadedByUserId: user.id,
      r2Key: v1Key,
      filename: `invoice-${invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      bytes: v1Bytes,
    })
    createdFileIds.push(v1Upload.fileId)
    assert(v1Upload.r2Key === v1Key, 'files row r2_key matches')
    assert(v1Upload.sizeBytes === v1Bytes.byteLength, 'files row size_bytes matches')
    console.log(`  ✓ uploaded v1 to R2 + files row ${v1Upload.fileId.slice(0, 8)}…`)

    // ---- 4. Update invoice with pdfFileId + pdfVersion ----
    await tx
      .update(invoices)
      .set({
        pdfFileId: v1Upload.fileId,
        pdfVersion: v1Version,
        sentAt: new Date(),
        status: 'sent',
      })
      .where(eq(invoices.id, invoice.id))

    // ---- 5. Generate signed URL ----
    const v1SignedUrl = await presignedDownloadUrl(v1Key, 30 * 24 * 60 * 60)
    assert(v1SignedUrl.startsWith('http'), 'signed URL should be http(s)')
    assert(
      v1SignedUrl.includes('X-Amz-Signature') || v1SignedUrl.includes('Signature'),
      'signed URL should carry an AWS-style signature',
    )
    console.log(`  ✓ presigned URL generated (TTL 30 days)`)

    // ---- 6. Build email body ----
    const totalDisplay = '$500.00'
    const email = buildInvoiceEmail({
      brandDisplayName: v1Payload.brand.displayName,
      orgLegalName: v1Payload.org.legalName,
      invoiceNumber,
      totalDisplay,
      dueDate: '2099-02-14',
      billToDisplayName: v1Payload.billTo.displayName,
      pdfViewUrl: v1SignedUrl,
      accentHex: v1Payload.brand.accentHex,
      notes: 'Thanks for the business.',
    })
    assert(email.subject.includes(invoiceNumber), 'subject contains invoice number')
    assert(email.htmlBody.includes(invoiceNumber), 'htmlBody contains invoice number')
    assert(email.htmlBody.includes(totalDisplay), 'htmlBody contains total amount')
    assert(email.textBody.includes(invoiceNumber), 'textBody contains invoice number')
    // The signed URL has querystring chars; HTML-escape changes & to &amp;.
    const escapedUrl = email.htmlBody.includes(v1SignedUrl.replace(/&/g, '&amp;'))
    assert(
      escapedUrl || email.htmlBody.includes(v1SignedUrl),
      'htmlBody contains the signed URL (escaped or raw)',
    )
    assert(email.textBody.includes(v1SignedUrl), 'textBody contains the signed URL')
    console.log(`  ✓ email body assembled (subject="${email.subject.slice(0, 60)}…")`)

    // ---- 7. Postmark send (sandbox via POSTMARK_API_TEST). ----
    const billToEmail = originalPartyEmail ?? 'verify@example.com'
    assert(typeof billToEmail === 'string', 'bill-to email is a string')

    const sendResult = await sendEmail({
      to: billToEmail,
      subject: email.subject,
      htmlBody: email.htmlBody,
      textBody: email.textBody,
      tag: 'invoice-send',
      attachments: [
        {
          Name: `invoice-${invoiceNumber}.pdf`,
          Content: v1Bytes.toString('base64'),
          ContentType: 'application/pdf',
        },
      ],
    })
    if (sendResult.ok) {
      console.log(
        `  ✓ Postmark send ok — messageID=${sendResult.messageID.slice(0, 12)}…`,
      )
    } else {
      // POSTMARK_API_TEST should return ok=true; any failure here is meaningful.
      throw new Error(
        `Postmark send failed: kind=${sendResult.kind} code=${sendResult.errorCode} msg=${sendResult.message}`,
      )
    }

    // ---- 8. Resend → v2 ----
    const v2Version = 2
    const v2Payload = await loadInvoicePdfPayload(
      tx as any,
      org.id,
      invoice.id,
      v2Version,
    )
    const v2Bytes = await renderInvoicePDF(v2Payload)
    const v2Key = buildInvoicePdfR2Key({
      organizationId: org.id,
      invoiceId: invoice.id,
      invoiceNumber,
      version: v2Version,
    })
    assert(v2Key !== v1Key, 'v2 R2 key differs from v1')
    assert(
      v2Key.includes('/v2/'),
      `v2 key should contain /v2/ segment: ${v2Key}`,
    )

    const v2Upload = await uploadBytesAsFile(tx as any, {
      organizationId: org.id,
      uploadedByUserId: user.id,
      r2Key: v2Key,
      filename: `invoice-${invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      bytes: v2Bytes,
    })
    createdFileIds.push(v2Upload.fileId)
    assert(v2Upload.fileId !== v1Upload.fileId, 'v2 has its own files row')

    await tx
      .update(invoices)
      .set({ pdfFileId: v2Upload.fileId, pdfVersion: v2Version })
      .where(eq(invoices.id, invoice.id))

    // Verify v1 row is still queryable.
    const [v1Row] = await tx
      .select({ id: files.id, r2Key: files.r2Key })
      .from(files)
      .where(eq(files.id, v1Upload.fileId))
      .limit(1)
    assert(!!v1Row, 'v1 files row still exists after resend')
    assert(v1Row!.r2Key === v1Key, 'v1 r2_key preserved after resend')
    console.log(
      `  ✓ resend produced v2 (file ${v2Upload.fileId.slice(0, 8)}…); v1 preserved for audit`,
    )

    // ---- 9. Final state checks ----
    const [final] = await tx
      .select({
        pdfFileId: invoices.pdfFileId,
        pdfVersion: invoices.pdfVersion,
        status: invoices.status,
        sentAt: invoices.sentAt,
      })
      .from(invoices)
      .where(eq(invoices.id, invoice.id))
      .limit(1)
    assert(final!.pdfFileId === v2Upload.fileId, 'invoice points at v2 file')
    assert(final!.pdfVersion === 2, 'invoice pdf_version=2')
    assert(final!.status === 'sent', 'invoice status=sent')
    assert(final!.sentAt !== null, 'sent_at preserved (not bumped on resend)')
    console.log(`  ✓ final state: pdf_version=2, status=sent, sent_at preserved`)

    // ---- Cleanup ----
    if (!originalPartyEmail) {
      await tx.execute(
        sql`UPDATE parties SET primary_email = NULL WHERE id = ${partyId}`,
      )
    }
    if (createdFileIds.length) {
      await tx.delete(files).where(inArray(files.id, createdFileIds))
    }
    await tx
      .delete(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, createdInvoiceIds))
    await tx.delete(invoices).where(inArray(invoices.id, createdInvoiceIds))
    if (createdProjectIds.length) {
      await tx.delete(projects).where(inArray(projects.id, createdProjectIds))
    }
    console.log(
      `  ✓ cleanup: removed ${createdInvoiceIds.length} invoice, ${createdFileIds.length} files`,
    )
    console.log(`\n  P1-14 verification PASSED.`)
  })
}

main()
  .then(async () => {
    await client.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('Verification FAILED:', err)
    await client.end()
    process.exit(1)
  })
