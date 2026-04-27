'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trpc } from '@/lib/trpc/client'
import { useFormWithAction } from '@/lib/forms/use-form-with-action'
import { createRevenue, updateRevenue } from '../actions/revenue'
import type { CreateRevenueInput, PaymentMethod, PaymentStatus } from '../actions/revenue-schema'
import { parseMoneyToCents, formatMoney } from '../lib/format-money'

const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: 'card', label: 'Card' },
  { value: 'ach', label: 'ACH transfer' },
  { value: 'wire', label: 'Wire transfer' },
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]

const PAYMENT_STATUSES: ReadonlyArray<{ value: PaymentStatus; label: string; helper: string }> = [
  { value: 'received', label: 'Received', helper: 'Money in hand. Books credit cash.' },
  { value: 'expected', label: 'Expected (invoiced)', helper: 'Awaiting payment. Books credit AR.' },
  { value: 'refunded', label: 'Refunded', helper: 'Money returned to payer.' },
  { value: 'failed', label: 'Failed', helper: 'Payment attempt failed.' },
]

const formSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  businessLineId: z.string().uuid('Pick a business line'),
  partyId: z.string().uuid().nullable(),
  chartOfAccountsId: z.string().uuid('Pick a revenue account'),
  amountInput: z.string().min(1, 'Required'),
  description: z.string().trim().min(1, 'Required').max(500),
  paymentMethod: z.enum(['check', 'ach', 'wire', 'card', 'cash', 'other']).nullable(),
  paymentStatus: z.enum(['expected', 'received', 'failed', 'refunded']),
  notes: z.string().trim().max(2000),
})

type FormValues = z.infer<typeof formSchema>

export interface RevenueFormProps {
  mode: 'create' | 'edit'
  existing?: {
    id: string
    entryDate: string
    businessLineId: string
    partyId: string | null
    chartOfAccountsId: string
    amountCents: number
    description: string
    paymentMethod: PaymentMethod | null
    paymentStatus: PaymentStatus
    notes: string | null
  }
  onSuccess?: (revenueId: string) => void
}

function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function RevenueForm({ mode, existing, onSuccess }: RevenueFormProps) {
  const router = useRouter()
  const businessLinesQuery = trpc.finance.pickerOptions.businessLines.useQuery()
  const accountsQuery = trpc.finance.pickerOptions.revenueAccounts.useQuery()
  const [payerQuery, setPayerQuery] = useState('')
  const payersQuery = trpc.finance.pickerOptions.searchPayers.useQuery({
    query: payerQuery,
    limit: 10,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          entryDate: existing.entryDate,
          businessLineId: existing.businessLineId,
          partyId: existing.partyId,
          chartOfAccountsId: existing.chartOfAccountsId,
          amountInput: (existing.amountCents / 100).toFixed(2),
          description: existing.description,
          paymentMethod: existing.paymentMethod,
          paymentStatus: existing.paymentStatus,
          notes: existing.notes ?? '',
        }
      : {
          entryDate: todayIsoDate(),
          businessLineId: '',
          partyId: null,
          chartOfAccountsId: '',
          amountInput: '',
          description: '',
          paymentMethod: 'ach',
          paymentStatus: 'received',
          notes: '',
        },
  })

  // Apply defaults from server data once it arrives (only for new revenue).
  useEffect(() => {
    if (mode !== 'create') return
    const bls = businessLinesQuery.data ?? []
    const accts = accountsQuery.data ?? []
    if (bls.length > 0 && !form.getValues('businessLineId')) {
      const first = bls[0]?.id
      if (first) form.setValue('businessLineId', first, { shouldValidate: false })
    }
    if (accts.length > 0 && !form.getValues('chartOfAccountsId')) {
      const first = accts[0]?.id
      if (first) form.setValue('chartOfAccountsId', first, { shouldValidate: false })
    }
  }, [mode, businessLinesQuery.data, accountsQuery.data, form])

  // When editing, detect material changes — show a warning that a correction
  // entry will be posted to the journal. (Cosmetic edits stay silent.)
  const watchedAmount = form.watch('amountInput')
  const watchedAccount = form.watch('chartOfAccountsId')
  const watchedBl = form.watch('businessLineId')
  const watchedStatus = form.watch('paymentStatus')

  const willPostCorrection = useMemo(() => {
    if (mode !== 'edit' || !existing) return false
    const newCents = parseMoneyToCents(watchedAmount || '0')
    return (
      newCents !== existing.amountCents ||
      watchedAccount !== existing.chartOfAccountsId ||
      watchedBl !== existing.businessLineId ||
      watchedStatus !== existing.paymentStatus
    )
  }, [mode, existing, watchedAmount, watchedAccount, watchedBl, watchedStatus])

  const { submit, submitting } = useFormWithAction({
    form,
    action: async (values) => {
      const input: CreateRevenueInput = {
        entryDate: values.entryDate,
        businessLineId: values.businessLineId,
        partyId: values.partyId,
        chartOfAccountsId: values.chartOfAccountsId,
        amountCents: parseMoneyToCents(values.amountInput),
        currencyCode: 'USD',
        description: values.description,
        paymentMethod: values.paymentMethod,
        paymentStatus: values.paymentStatus,
        notes: values.notes || null,
      }
      if (mode === 'edit' && existing) {
        return updateRevenue({ id: existing.id, ...input })
      }
      return createRevenue(input)
    },
    successMessage: mode === 'create' ? 'Revenue saved' : 'Revenue updated',
    onSuccess: (data) => {
      if (onSuccess) {
        onSuccess(data.id)
      } else {
        router.push(`/finance/revenue/${data.id}`)
      }
      router.refresh()
    },
  })

  const cents = parseMoneyToCents(watchedAmount || '0')
  const selectedStatus = PAYMENT_STATUSES.find((p) => p.value === watchedStatus)

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
      {/* Amount — primary input, prominent on mobile */}
      <div>
        <Label htmlFor="amountInput">Amount (USD)</Label>
        <Input
          id="amountInput"
          inputMode="decimal"
          placeholder="0.00"
          {...form.register('amountInput')}
        />
        {cents > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">{formatMoney(cents)}</p>
        )}
        {form.formState.errors.amountInput && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.amountInput.message}</p>
        )}
      </div>

      {/* Revenue account */}
      <div>
        <Label htmlFor="chartOfAccountsId">Revenue account</Label>
        <Select
          value={form.watch('chartOfAccountsId') || undefined}
          onValueChange={(v) => form.setValue('chartOfAccountsId', v, { shouldValidate: true })}
        >
          <SelectTrigger id="chartOfAccountsId">
            <SelectValue placeholder="Pick a revenue account" />
          </SelectTrigger>
          <SelectContent>
            {(accountsQuery.data ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.accountNumber} — {a.accountName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          From your Chart of Accounts. Edit categories in Settings → Finance.
        </p>
        {form.formState.errors.chartOfAccountsId && (
          <p className="mt-1 text-xs text-red-600">
            {form.formState.errors.chartOfAccountsId.message}
          </p>
        )}
      </div>

      {/* Business line */}
      <div>
        <Label htmlFor="businessLineId">Business line</Label>
        <Select
          value={form.watch('businessLineId') || undefined}
          onValueChange={(v) => form.setValue('businessLineId', v, { shouldValidate: true })}
        >
          <SelectTrigger id="businessLineId">
            <SelectValue placeholder="Pick a business line" />
          </SelectTrigger>
          <SelectContent>
            {(businessLinesQuery.data ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.businessLineId && (
          <p className="mt-1 text-xs text-red-600">
            {form.formState.errors.businessLineId.message}
          </p>
        )}
      </div>

      {/* Payer (typeahead) */}
      <div>
        <Label htmlFor="partyId">Received from</Label>
        <Input
          id="payer-search"
          placeholder="Type to search…"
          value={payerQuery}
          onChange={(e) => setPayerQuery(e.target.value)}
        />
        {(payersQuery.data ?? []).length > 0 && (
          <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover">
            {(payersQuery.data ?? []).map((p) => {
              const isSelected = form.watch('partyId') === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    form.setValue('partyId', p.id, { shouldValidate: true })
                    setPayerQuery(p.displayName)
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    isSelected ? 'bg-accent' : ''
                  }`}
                >
                  <div className="font-medium">{p.displayName}</div>
                  {p.primaryEmail && (
                    <div className="text-xs text-muted-foreground">{p.primaryEmail}</div>
                  )}
                </button>
              )
            })}
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Optional — leave blank for unattributed revenue.
        </p>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Description</Label>
        <Input id="description" placeholder="May consulting hours" {...form.register('description')} />
        {form.formState.errors.description && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.description.message}</p>
        )}
      </div>

      {/* Date */}
      <div>
        <Label htmlFor="entryDate">Date</Label>
        <Input id="entryDate" type="date" {...form.register('entryDate')} />
        {form.formState.errors.entryDate && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.entryDate.message}</p>
        )}
      </div>

      {/* Payment status — drives the journal's debit side */}
      <div>
        <Label htmlFor="paymentStatus">Payment status</Label>
        <Select
          value={form.watch('paymentStatus')}
          onValueChange={(v) =>
            form.setValue('paymentStatus', v as FormValues['paymentStatus'], {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger id="paymentStatus">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_STATUSES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedStatus && (
          <p className="mt-1 text-xs text-muted-foreground">{selectedStatus.helper}</p>
        )}
      </div>

      {/* Payment method (optional) */}
      <div>
        <Label htmlFor="paymentMethod">Payment method</Label>
        <Select
          value={form.watch('paymentMethod') ?? 'none'}
          onValueChange={(v) =>
            form.setValue('paymentMethod', v === 'none' ? null : (v as FormValues['paymentMethod']))
          }
        >
          <SelectTrigger id="paymentMethod">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Unspecified —</SelectItem>
            {PAYMENT_METHODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Notes */}
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={3} {...form.register('notes')} />
      </div>

      {willPostCorrection && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            This change will create a correction entry in the journal — the original entry is
            reversed and a new one posted in its place.
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === 'create' ? 'Saving...' : 'Updating...'}
            </>
          ) : mode === 'create' ? (
            'Save revenue'
          ) : (
            'Update revenue'
          )}
        </Button>
      </div>
    </form>
  )
}
