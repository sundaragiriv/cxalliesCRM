import { and, asc, eq } from 'drizzle-orm'
import { invoices, invoiceLines } from '../schema'
import {
  organizations,
  parties,
  brands,
  businessLines,
} from '@/modules/parties/schema'
import { active } from '@/lib/db/active'
import type { FinanceTx } from '@/lib/audit/with-audit'
import type { InvoicePdfPayload } from '../lib/invoice-pdf/types'

/**
 * Phase 1 brand → accent hex map. Replaced in P1-25 by an `accent_hex`
 * column on the `brands` table; for now this lookup keeps the renderer
 * deterministic without blocking on the broader brand palette work.
 *
 * Values mirror the `--primary` HSL from `globals.css`:
 *   cxallies     → hsl(221.2 83.2% 53.3%) ≈ #3b82f6 (blue-500)
 */
const BRAND_ACCENT_HEX: Record<string, string> = {
  cxallies: '#3b82f6',
  'pravara-ai': '#7c3aed',
  'varahi-systems': '#0d9488',
  'moonking-studios': '#db2777',
}

const DEFAULT_ACCENT_HEX = '#3b82f6'

export async function loadInvoicePdfPayload(
  tx: FinanceTx,
  organizationId: string,
  invoiceId: string,
  pdfVersion: number,
): Promise<InvoicePdfPayload> {
  // Org (singleton in Phase 1).
  const [org] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)
  if (!org) throw new Error('Organization not found')

  // Invoice + business line + brand + bill-to party — one join.
  const [row] = await tx
    .select({
      invoice: invoices,
      bl: businessLines,
      brand: brands,
      billTo: parties,
    })
    .from(invoices)
    .innerJoin(businessLines, eq(businessLines.id, invoices.businessLineId))
    .innerJoin(brands, eq(brands.id, businessLines.brandId))
    .innerJoin(parties, eq(parties.id, invoices.billToPartyId))
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.organizationId, organizationId),
        active(invoices),
      ),
    )
    .limit(1)
  if (!row) throw new Error('Invoice not found')

  const lines = await tx
    .select({
      lineNumber: invoiceLines.lineNumber,
      description: invoiceLines.description,
      quantity: invoiceLines.quantity,
      unitPriceCents: invoiceLines.unitPriceCents,
      amountCents: invoiceLines.amountCents,
      currencyCode: invoiceLines.currencyCode,
    })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))
    .orderBy(asc(invoiceLines.lineNumber))

  const accentHex = BRAND_ACCENT_HEX[row.brand.slug] ?? DEFAULT_ACCENT_HEX

  return {
    org: {
      legalName: org.legalName,
      displayName: org.displayName,
      addressLine1: org.addressLine1,
      addressLine2: org.addressLine2,
      city: org.city,
      state: org.state,
      postalCode: org.postalCode,
      country: org.country,
      phone: org.phone,
      email: org.email,
      website: org.website,
      ein: org.ein,
    },
    brand: {
      name: row.brand.name,
      displayName: row.brand.displayName,
      accentHex,
    },
    businessLineName: row.bl.name,
    invoice: {
      invoiceNumber: row.invoice.invoiceNumber,
      issueDate: row.invoice.issueDate,
      dueDate: row.invoice.dueDate,
      periodStart: row.invoice.periodStart,
      periodEnd: row.invoice.periodEnd,
      currencyCode: row.invoice.currencyCode,
      subtotalCents: row.invoice.subtotalCents,
      taxCents: row.invoice.taxCents,
      totalCents: row.invoice.totalCents,
      terms: row.invoice.terms,
      notes: row.invoice.notes,
      version: pdfVersion,
    },
    billTo: {
      displayName: row.billTo.displayName,
      legalName: row.billTo.legalName,
      primaryEmail: row.billTo.primaryEmail,
    },
    lines: lines.map((l) => ({
      lineNumber: l.lineNumber,
      description: l.description,
      quantityText: l.quantity,
      unitPriceCents: l.unitPriceCents,
      amountCents: l.amountCents,
      currencyCode: l.currencyCode,
    })),
  }
}
