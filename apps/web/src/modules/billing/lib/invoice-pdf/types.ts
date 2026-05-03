/**
 * Snapshot payload passed to the invoice PDF renderer. Per conventions
 * §3.13, every field that influences what a recipient sees is captured
 * at render time and stored byte-for-byte in the generated PDF — later
 * edits to organizations/brands/parties/lines do not retroactively
 * mutate previously-sent PDFs.
 */
export type InvoicePdfPayload = {
  org: {
    legalName: string
    displayName: string
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    country: string | null
    phone: string | null
    email: string | null
    website: string | null
    ein: string | null
  }
  brand: {
    name: string
    displayName: string
    /** Hex color (e.g. '#1f3a5f'). Used for the accent stripe + heading color. */
    accentHex: string
  }
  businessLineName: string
  invoice: {
    invoiceNumber: string
    issueDate: string
    dueDate: string
    periodStart: string | null
    periodEnd: string | null
    currencyCode: string
    subtotalCents: number
    taxCents: number
    totalCents: number
    terms: string | null
    notes: string | null
    /** Version of this PDF render (1, 2, ...). Shown small in the footer for audit. */
    version: number
  }
  billTo: {
    displayName: string
    legalName: string | null
    primaryEmail: string | null
  }
  lines: Array<{
    lineNumber: number
    description: string
    quantityText: string
    unitPriceCents: number
    amountCents: number
    currencyCode: string
  }>
}
