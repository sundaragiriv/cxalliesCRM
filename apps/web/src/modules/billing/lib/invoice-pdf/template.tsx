// React is referenced by the JSX classic transform that `tsx` uses when running
// `scripts/verify-*.ts` outside the Next bundler (which has its own automatic
// runtime). Keeping the explicit import makes the template runnable in both
// contexts without depending on tsconfig.jsx.
import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { InvoicePdfPayload } from './types'

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
  },
  accentStripe: {
    height: 6,
    marginHorizontal: -48,
    marginTop: -48,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  brandName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  legalLine: {
    fontSize: 9,
    color: '#4b5563',
  },
  invoiceTitle: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  invoiceNumber: {
    fontSize: 11,
    color: '#4b5563',
    textAlign: 'right',
    marginTop: 2,
  },
  partiesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  partyBlock: {
    width: '48%',
  },
  partyLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6b7280',
    marginBottom: 4,
  },
  partyName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  partyDetail: {
    fontSize: 10,
    color: '#374151',
    marginBottom: 1,
  },
  metaTable: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  metaCell: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6b7280',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
  },
  linesHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  lineRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  colDescription: { flex: 4 },
  colQty: { flex: 1, textAlign: 'right' },
  colUnit: { flex: 1.5, textAlign: 'right' },
  colAmount: { flex: 1.5, textAlign: 'right' },
  totalsBlock: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalsTable: {
    width: '40%',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalsLabel: {
    color: '#4b5563',
  },
  totalsValue: {
    fontFamily: 'Helvetica-Bold',
  },
  totalsGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  totalsGrandLabel: {
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
  totalsGrandValue: {
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
  notesBlock: {
    marginTop: 24,
  },
  notesLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6b7280',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 10,
    color: '#374151',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    left: 48,
    right: 48,
    bottom: 24,
    fontSize: 8,
    color: '#9ca3af',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

function joinNonEmpty(parts: Array<string | null | undefined>, sep: string): string {
  return parts.filter((p): p is string => Boolean(p && p.trim().length)).join(sep)
}

export function InvoiceDocument({ payload }: { payload: InvoicePdfPayload }) {
  const accent = payload.brand.accentHex
  const cityState = joinNonEmpty([payload.org.city, payload.org.state], ', ')
  const cityStateZip = joinNonEmpty([cityState, payload.org.postalCode], ' ')

  return (
    <Document
      title={`Invoice ${payload.invoice.invoiceNumber}`}
      author={payload.org.legalName}
      subject={`Invoice from ${payload.brand.displayName}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={[styles.accentStripe, { backgroundColor: accent }]} />

        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.brandName, { color: accent }]}>
              {payload.brand.displayName}
            </Text>
            <Text style={styles.legalLine}>{payload.org.legalName}</Text>
            {payload.org.addressLine1 ? (
              <Text style={styles.legalLine}>{payload.org.addressLine1}</Text>
            ) : null}
            {payload.org.addressLine2 ? (
              <Text style={styles.legalLine}>{payload.org.addressLine2}</Text>
            ) : null}
            {cityStateZip ? <Text style={styles.legalLine}>{cityStateZip}</Text> : null}
            {payload.org.country ? (
              <Text style={styles.legalLine}>{payload.org.country}</Text>
            ) : null}
            {payload.org.email ? (
              <Text style={styles.legalLine}>{payload.org.email}</Text>
            ) : null}
            {payload.org.ein ? (
              <Text style={[styles.legalLine, { marginTop: 4 }]}>EIN: {payload.org.ein}</Text>
            ) : null}
          </View>
          <View>
            <Text style={[styles.invoiceTitle, { color: accent }]}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{payload.invoice.invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>Bill To</Text>
            <Text style={styles.partyName}>{payload.billTo.displayName}</Text>
            {payload.billTo.legalName &&
            payload.billTo.legalName !== payload.billTo.displayName ? (
              <Text style={styles.partyDetail}>{payload.billTo.legalName}</Text>
            ) : null}
            {payload.billTo.primaryEmail ? (
              <Text style={styles.partyDetail}>{payload.billTo.primaryEmail}</Text>
            ) : null}
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>Business Line</Text>
            <Text style={styles.partyName}>{payload.businessLineName}</Text>
          </View>
        </View>

        <View style={styles.metaTable}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Issue Date</Text>
            <Text style={styles.metaValue}>{payload.invoice.issueDate}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Due Date</Text>
            <Text style={styles.metaValue}>{payload.invoice.dueDate}</Text>
          </View>
          {payload.invoice.periodStart && payload.invoice.periodEnd ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Period</Text>
              <Text style={styles.metaValue}>
                {payload.invoice.periodStart} → {payload.invoice.periodEnd}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Currency</Text>
            <Text style={styles.metaValue}>{payload.invoice.currencyCode}</Text>
          </View>
        </View>

        <View style={[styles.linesHeader, { backgroundColor: accent }]}>
          <Text style={styles.colDescription}>Description</Text>
          <Text style={styles.colQty}>Qty</Text>
          <Text style={styles.colUnit}>Unit Price</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>
        {payload.lines.map((l) => (
          <View key={l.lineNumber} style={styles.lineRow} wrap={false}>
            <Text style={styles.colDescription}>{l.description}</Text>
            <Text style={styles.colQty}>{l.quantityText}</Text>
            <Text style={styles.colUnit}>
              {formatMoney(l.unitPriceCents, l.currencyCode)}
            </Text>
            <Text style={styles.colAmount}>
              {formatMoney(l.amountCents, l.currencyCode)}
            </Text>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>
                {formatMoney(payload.invoice.subtotalCents, payload.invoice.currencyCode)}
              </Text>
            </View>
            {payload.invoice.taxCents > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax</Text>
                <Text style={styles.totalsValue}>
                  {formatMoney(payload.invoice.taxCents, payload.invoice.currencyCode)}
                </Text>
              </View>
            ) : null}
            <View style={[styles.totalsGrand, { backgroundColor: accent }]}>
              <Text style={styles.totalsGrandLabel}>Total Due</Text>
              <Text style={styles.totalsGrandValue}>
                {formatMoney(payload.invoice.totalCents, payload.invoice.currencyCode)}
              </Text>
            </View>
          </View>
        </View>

        {payload.invoice.terms ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Payment Terms</Text>
            <Text style={styles.notesText}>{payload.invoice.terms}</Text>
          </View>
        ) : null}

        {payload.invoice.notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{payload.invoice.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            {payload.brand.displayName} · {payload.org.legalName}
          </Text>
          <Text>
            {payload.invoice.invoiceNumber} · v{payload.invoice.version}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
