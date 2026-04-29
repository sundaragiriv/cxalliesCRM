'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CircleDollarSign,
  Loader2,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { trpc } from '@/lib/trpc/client'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'
import {
  markInvoicePaid,
  sendInvoice,
  softDeleteInvoice,
  voidInvoice,
} from '../actions/invoices'
import {
  nextAllowedStates,
  type InvoiceStatus,
} from '../lib/invoices/state-machine'

function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const query = trpc.billing.invoices.get.useQuery({ id: invoiceId })
  const journalQuery = trpc.billing.invoices.journal.useQuery({ invoiceId })
  const paymentsQuery = trpc.billing.payments.listForInvoice.useQuery({ invoiceId })

  const [pending, setPending] = useState<string | null>(null)
  const [showVoid, setShowVoid] = useState(false)
  const [showMarkPaid, setShowMarkPaid] = useState(false)

  if (query.isLoading) return <Skeleton className="h-96 w-full" />
  if (!query.data) return <p className="text-sm text-muted-foreground">Invoice not found.</p>

  const invoice = query.data
  const status = invoice.status as InvoiceStatus
  const allowed = nextAllowedStates(status)
  const remainingCents = invoice.totalCents - (invoice.paidCents ?? 0)

  async function refresh() {
    await Promise.all([
      utils.billing.invoices.get.invalidate({ id: invoiceId }),
      utils.billing.invoices.journal.invalidate({ invoiceId }),
      utils.billing.payments.listForInvoice.invalidate({ invoiceId }),
      utils.billing.invoices.list.invalidate(),
    ])
  }

  async function runAction<T>(
    label: string,
    fn: () => Promise<{ success: true; data: T } | { success: false; error: string }>,
    successMessage: string,
  ) {
    setPending(label)
    try {
      const result = await fn()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(successMessage)
      await refresh()
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/billing/invoices"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to invoices
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
            <InvoiceStatusBadge status={status} dueDate={invoice.dueDate} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Bill to: <span className="text-foreground">{invoice.billToName}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {invoice.businessLineName} · Issued {invoice.issueDate} · Due {invoice.dueDate}
            {invoice.periodStart && invoice.periodEnd && (
              <>
                {' '}
                · Period {invoice.periodStart} → {invoice.periodEnd}
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums">
            {formatMoney(invoice.totalCents, invoice.currencyCode)}
          </p>
          {(invoice.paidCents ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              Paid {formatMoney(invoice.paidCents ?? 0, invoice.currencyCode)} ·
              Remaining{' '}
              <span className={remainingCents > 0 ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}>
                {formatMoney(remainingCents, invoice.currencyCode)}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {allowed.includes('sent') && (
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              runAction(
                'send',
                () => sendInvoice({ id: invoice.id }),
                'Marked as sent — journal posted',
              )
            }
          >
            {pending === 'send' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Mark as sent
          </Button>
        )}
        {(status === 'sent' || status === 'partially_paid') && remainingCents > 0 && (
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() => setShowMarkPaid(true)}
          >
            <CircleDollarSign className="mr-2 h-4 w-4" />
            Record payment
          </Button>
        )}
        {allowed.includes('void') && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => setShowVoid(true)}
          >
            <X className="mr-2 h-4 w-4" />
            Void
          </Button>
        )}
        {(status === 'draft' || status === 'void') && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => {
              if (!confirm('Delete this invoice?')) return
              runAction(
                'delete',
                () => softDeleteInvoice({ id: invoice.id }),
                'Invoice deleted',
              ).then(() => router.push('/billing/invoices'))
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lines</h2>
        <div className="rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.accountName ?? <em>(resolves at send)</em>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(l.unitPriceCents, l.currencyCode)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(l.amountCents, l.currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell colSpan={4} className="text-right">
                  Subtotal
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(invoice.subtotalCents, invoice.currencyCode)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-right text-sm text-muted-foreground">
                  Tax
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(invoice.taxCents, invoice.currencyCode)}
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/30 font-bold">
                <TableCell colSpan={4} className="text-right">
                  Total
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(invoice.totalCents, invoice.currencyCode)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {(paymentsQuery.data ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Payments</h2>
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(paymentsQuery.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">
                      {p.paymentNumber}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.paymentDate}</TableCell>
                    <TableCell className="text-sm capitalize">{p.paymentMethod}</TableCell>
                    <TableCell className="text-sm">{p.reference ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(p.appliedCents, p.currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {(journalQuery.data?.entries.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Journal</h2>
          <p className="text-xs text-muted-foreground">
            Append-only. Send posts AR debit + revenue credits; void reverses with a mirror entry.
          </p>
          <div className="space-y-3">
            {journalQuery.data!.entries.map((entry) => {
              const lines = journalQuery.data!.lines.filter(
                (l) => l.journalEntryId === entry.id,
              )
              return (
                <div key={entry.id} className="rounded-lg border bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-medium">{entry.entryNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.entryDate} · {entry.description}
                      </p>
                    </div>
                    {entry.isReversal && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        Reversal
                      </span>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-sm">{l.description ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {l.debitCents > 0 ? formatMoney(l.debitCents, l.currencyCode) : ''}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {l.creditCents > 0 ? formatMoney(l.creditCents, l.currencyCode) : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <VoidDialog
        open={showVoid}
        onOpenChange={setShowVoid}
        invoiceNumber={invoice.invoiceNumber}
        onConfirm={async (reason) => {
          await runAction(
            'void',
            () => voidInvoice({ id: invoice.id, reason }),
            'Invoice voided — journal reversed',
          )
          setShowVoid(false)
        }}
      />
      <MarkPaidDialog
        open={showMarkPaid}
        onOpenChange={setShowMarkPaid}
        invoiceNumber={invoice.invoiceNumber}
        currencyCode={invoice.currencyCode}
        remainingCents={remainingCents}
        onConfirm={async (input) => {
          await runAction(
            'pay',
            () =>
              markInvoicePaid({
                invoiceId: invoice.id,
                amountCents: input.amountCents,
                paymentDate: input.paymentDate,
                paymentMethod: input.paymentMethod,
                reference: input.reference,
              }),
            'Payment recorded',
          )
          setShowMarkPaid(false)
        }}
      />
    </div>
  )
}

function VoidDialog({
  open,
  onOpenChange,
  invoiceNumber,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNumber: string
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg">
        <h3 className="text-lg font-semibold">Void {invoiceNumber}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Reverses the invoice journal. Releases linked time entries and expenses for re-invoicing.
          Cannot be undone.
        </p>
        <Label htmlFor="reason" className="mt-3 block">
          Reason
        </Label>
        <Textarea
          id="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Customer disputed line 3 — issuing replacement invoice"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || reason.trim().length === 0}
            onClick={async () => {
              setSubmitting(true)
              try {
                await onConfirm(reason.trim())
              } finally {
                setSubmitting(false)
              }
            }}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Void invoice
          </Button>
        </div>
      </div>
    </div>
  )
}

function MarkPaidDialog({
  open,
  onOpenChange,
  invoiceNumber,
  currencyCode,
  remainingCents,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNumber: string
  currencyCode: string
  remainingCents: number
  onConfirm: (input: {
    amountCents: number
    paymentDate: string
    paymentMethod: 'check' | 'ach' | 'wire' | 'card' | 'cash' | 'other'
    reference?: string
  }) => Promise<void>
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [paymentDate, setPaymentDate] = useState(today)
  const [amountInput, setAmountInput] = useState((remainingCents / 100).toFixed(2))
  const [method, setMethod] = useState<'check' | 'ach' | 'wire' | 'card' | 'cash' | 'other'>('ach')
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (!open) return null

  const amountCents = Math.round(parseFloat(amountInput || '0') * 100)
  const valid = amountCents > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg">
        <h3 className="text-lg font-semibold">Record payment for {invoiceNumber}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Posts a 2-line journal: DEBIT Cash, CREDIT AR. Cash basis tax estimate recomputes.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="paymentDate">Payment date</Label>
            <Input
              id="paymentDate"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="amount">
              Amount ({currencyCode}) — remaining {(remainingCents / 100).toFixed(2)}
            </Label>
            <Input
              id="amount"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="method">Payment method</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as typeof method)}
            >
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="wire">Wire</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input
              id="reference"
              placeholder="Check #1234, wire confirmation, etc."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || submitting}
            onClick={async () => {
              setSubmitting(true)
              try {
                await onConfirm({
                  amountCents,
                  paymentDate,
                  paymentMethod: method,
                  reference: reference.trim() || undefined,
                })
              } finally {
                setSubmitting(false)
              }
            }}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </div>
      </div>
    </div>
  )
}
