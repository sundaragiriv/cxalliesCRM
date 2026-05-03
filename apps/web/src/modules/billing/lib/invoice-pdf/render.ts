import { renderToBuffer } from '@react-pdf/renderer'
import { InvoiceDocument } from './template'
import type { InvoicePdfPayload } from './types'

/**
 * Pure side-effect-free render: payload in, PDF bytes out. Caller decides
 * what to do with the bytes (upload to R2, attach to email, write to disk
 * for verify scripts, etc.).
 *
 * `@react-pdf/renderer`'s `renderToBuffer` is async because it lays out
 * pages, embeds fonts, and computes the PDF byte stream. ~50-200ms on
 * a single-page invoice.
 */
export async function renderInvoicePDF(payload: InvoicePdfPayload): Promise<Buffer> {
  return renderToBuffer(InvoiceDocument({ payload }))
}
