'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trpc } from '@/lib/trpc/client'
import { useFormWithAction } from '@/lib/forms/use-form-with-action'
import { FilePicker } from '@/components/files/FilePicker'
import { createExpense, updateExpense } from '../actions/expenses'
import type { CreateExpenseInput } from '../actions/expenses-schema'
import { parseMoneyToCents, formatMoney } from '../lib/format-money'

const PAYMENT_SOURCES = [
  { value: 'business_card', label: 'Business card' },
  { value: 'personal_card_business_use', label: 'Personal card (business use)' },
  { value: 'personal_cash', label: 'Personal cash' },
  { value: 'business_check', label: 'Business check' },
  { value: 'business_ach', label: 'Business ACH' },
  { value: 'vendor_paid', label: 'Paid by vendor' },
] as const

const formSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  businessLineId: z.string().uuid('Pick a business line'),
  chartOfAccountsId: z.string().uuid('Pick an expense account'),
  amountInput: z.string().min(1, 'Required'),
  description: z.string().trim().min(1, 'Required').max(500),
  paymentSource: z.enum([
    'business_card',
    'personal_card_business_use',
    'personal_cash',
    'business_check',
    'business_ach',
    'vendor_paid',
  ]),
  corporateCardId: z.string().uuid().nullable(),
  isBillable: z.boolean(),
  isReimbursable: z.boolean(),
  receiptFileId: z.string().uuid().nullable(),
  notes: z.string().trim().max(2000),
})

type FormValues = z.infer<typeof formSchema>

export interface ExpenseFormProps {
  mode: 'create' | 'edit'
  existing?: {
    id: string
    entryDate: string
    businessLineId: string
    chartOfAccountsId: string
    amountCents: number
    description: string
    paymentSource: FormValues['paymentSource']
    corporateCardId: string | null
    isBillable: boolean
    isReimbursable: boolean
    receiptFileId: string | null
    notes: string | null
  }
  /** Override the default post-submit behavior (which routes to the detail page). */
  onSuccess?: (expenseId: string) => void
}

function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ExpenseForm({ mode, existing, onSuccess }: ExpenseFormProps) {
  const router = useRouter()

  const businessLinesQuery = trpc.finance.pickerOptions.businessLines.useQuery()
  const accountsQuery = trpc.finance.pickerOptions.expenseAccounts.useQuery()
  const cardsQuery = trpc.finance.pickerOptions.corporateCards.useQuery()
  const lastUsedQuery = trpc.finance.pickerOptions.lastUsed.useQuery()

  const [receiptMeta, setReceiptMeta] = useState<{ filename: string; mimeType: string } | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          entryDate: existing.entryDate,
          businessLineId: existing.businessLineId,
          chartOfAccountsId: existing.chartOfAccountsId,
          amountInput: (existing.amountCents / 100).toFixed(2),
          description: existing.description,
          paymentSource: existing.paymentSource,
          corporateCardId: existing.corporateCardId,
          isBillable: existing.isBillable,
          isReimbursable: existing.isReimbursable,
          receiptFileId: existing.receiptFileId,
          notes: existing.notes ?? '',
        }
      : {
          entryDate: todayIsoDate(),
          businessLineId: '',
          chartOfAccountsId: '',
          amountInput: '',
          description: '',
          paymentSource: 'business_card',
          corporateCardId: null,
          isBillable: false,
          isReimbursable: false,
          receiptFileId: null,
          notes: '',
        },
  })

  // Apply defaults from server data once it arrives (only for new expenses).
  useEffect(() => {
    if (mode !== 'create') return
    const bls = businessLinesQuery.data ?? []
    const accts = accountsQuery.data ?? []
    const lastUsed = lastUsedQuery.data
    if (bls.length > 0 && !form.getValues('businessLineId')) {
      const fallback = lastUsed?.businessLineId ?? bls[0]?.id
      if (fallback) form.setValue('businessLineId', fallback, { shouldValidate: false })
    }
    if (accts.length > 0 && !form.getValues('chartOfAccountsId')) {
      const fallback = lastUsed?.chartOfAccountsId ?? accts[0]?.id
      if (fallback) form.setValue('chartOfAccountsId', fallback, { shouldValidate: false })
    }
    if (lastUsed?.paymentSource) {
      form.setValue('paymentSource', lastUsed.paymentSource, { shouldValidate: false })
    }
  }, [mode, businessLinesQuery.data, accountsQuery.data, lastUsedQuery.data, form])

  const { submit, submitting } = useFormWithAction({
    form,
    action: async (values) => {
      const input: CreateExpenseInput = {
        entryDate: values.entryDate,
        businessLineId: values.businessLineId,
        chartOfAccountsId: values.chartOfAccountsId,
        amountCents: parseMoneyToCents(values.amountInput),
        currencyCode: 'USD',
        description: values.description,
        paymentSource: values.paymentSource,
        corporateCardId: values.corporateCardId,
        isBillable: values.isBillable,
        isReimbursable: values.isReimbursable,
        receiptFileId: values.receiptFileId,
        notes: values.notes || null,
      }
      if (mode === 'edit' && existing) {
        return updateExpense({ id: existing.id, ...input })
      }
      return createExpense(input)
    },
    successMessage: mode === 'create' ? 'Expense saved' : 'Expense updated',
    onSuccess: (data) => {
      if (onSuccess) {
        onSuccess(data.id)
      } else {
        router.push(`/finance/expenses/${data.id}`)
      }
      router.refresh()
    },
  })

  const watchedAmount = form.watch('amountInput')
  const cents = parseMoneyToCents(watchedAmount || '0')

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
      {/* Top row: receipt picker (mobile-first prominent placement) */}
      <div>
        <Label className="mb-2 block">Receipt</Label>
        <FilePicker
          module="finance"
          entity="expense-receipts"
          attached={
            form.getValues('receiptFileId')
              ? receiptMeta ?? { filename: 'Attached', mimeType: 'application/octet-stream' }
              : null
          }
          onUploaded={(fileId, meta) => {
            form.setValue('receiptFileId', fileId, { shouldValidate: true })
            setReceiptMeta(meta)
          }}
          onCleared={() => {
            form.setValue('receiptFileId', null, { shouldValidate: true })
            setReceiptMeta(null)
          }}
        />
      </div>

      {/* Date */}
      <div>
        <Label htmlFor="entryDate">Date</Label>
        <Input id="entryDate" type="date" {...form.register('entryDate')} />
        {form.formState.errors.entryDate && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.entryDate.message}</p>
        )}
      </div>

      {/* Amount */}
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

      {/* Account (CoA expense category) */}
      <div>
        <Label htmlFor="chartOfAccountsId">Category</Label>
        <Select
          value={form.watch('chartOfAccountsId') || undefined}
          onValueChange={(v) => form.setValue('chartOfAccountsId', v, { shouldValidate: true })}
        >
          <SelectTrigger id="chartOfAccountsId">
            <SelectValue placeholder="Pick an expense account" />
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
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.chartOfAccountsId.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Description</Label>
        <Input id="description" placeholder="Lunch with client" {...form.register('description')} />
        {form.formState.errors.description && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.description.message}</p>
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
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.businessLineId.message}</p>
        )}
      </div>

      {/* Payment source */}
      <div>
        <Label htmlFor="paymentSource">Paid via</Label>
        <Select
          value={form.watch('paymentSource')}
          onValueChange={(v) => form.setValue('paymentSource', v as FormValues['paymentSource'], { shouldValidate: true })}
        >
          <SelectTrigger id="paymentSource">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_SOURCES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Corporate card (optional, only when payment source = business_card) */}
      {form.watch('paymentSource') === 'business_card' && (cardsQuery.data ?? []).length > 0 && (
        <div>
          <Label htmlFor="corporateCardId">Card</Label>
          <Select
            value={form.watch('corporateCardId') ?? 'none'}
            onValueChange={(v) =>
              form.setValue('corporateCardId', v === 'none' ? null : v, { shouldValidate: true })
            }
          >
            <SelectTrigger id="corporateCardId">
              <SelectValue placeholder="Pick a card" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Unassigned —</SelectItem>
              {(cardsQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nickname} ··· {c.lastFour}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Billable / reimbursable flags */}
      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
        <label className="flex items-center gap-3">
          <Checkbox
            checked={form.watch('isBillable')}
            onCheckedChange={(v) => form.setValue('isBillable', !!v)}
          />
          <span className="text-sm">
            Billable — pass through to a client invoice (P1-09)
          </span>
        </label>
        <label className="flex items-center gap-3">
          <Checkbox
            checked={form.watch('isReimbursable')}
            onCheckedChange={(v) => form.setValue('isReimbursable', !!v)}
          />
          <span className="text-sm">Reimbursable — Varahi owes the submitter</span>
        </label>
      </div>

      {/* Notes */}
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={3} {...form.register('notes')} />
      </div>

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
            'Save expense'
          ) : (
            'Update expense'
          )}
        </Button>
      </div>
    </form>
  )
}
