'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  createExpenseReport,
  updateExpenseReport,
} from '../actions/expense-reports'
import { formatMoney } from '../lib/format-money'

const formSchema = z.object({
  purpose: z.string().trim().min(1, 'Required').max(500),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  businessLineId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
})

type FormValues = z.infer<typeof formSchema>

export interface ExpenseReportFormProps {
  mode: 'create' | 'edit'
  existing?: {
    id: string
    purpose: string
    periodStart: string
    periodEnd: string
    businessLineId: string | null
    projectId: string | null
  }
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ExpenseReportForm({ mode, existing }: ExpenseReportFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Pre-selected expenses (from "Create report from selected" on the expense list).
  const preselectedFromUrl = useMemo(() => {
    const raw = searchParams.get('expenseIds')
    if (!raw) return [] as string[]
    return raw.split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x))
  }, [searchParams])

  const businessLinesQuery = trpc.finance.pickerOptions.businessLines.useQuery()
  const eligibleQuery = trpc.finance.expenseReports.eligibleExpenses.useQuery(
    { limit: 100 },
    { enabled: mode === 'create' },
  )
  const subjectPartyQuery = trpc.finance.expenseReports.myDefaultSubjectParty.useQuery(
    undefined,
    { enabled: mode === 'create' },
  )

  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(
    new Set(preselectedFromUrl),
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          purpose: existing.purpose,
          periodStart: existing.periodStart,
          periodEnd: existing.periodEnd,
          businessLineId: existing.businessLineId,
          projectId: existing.projectId,
        }
      : {
          purpose: '',
          periodStart: todayIso(),
          periodEnd: todayIso(),
          businessLineId: null,
          projectId: null,
        },
  })

  // Auto-fill period dates from selected expenses (min/max entry_date).
  useEffect(() => {
    if (mode !== 'create' || selectedExpenseIds.size === 0) return
    const eligible = eligibleQuery.data ?? []
    const selected = eligible.filter((e) => selectedExpenseIds.has(e.id))
    if (selected.length === 0) return
    const dates = selected.map((e) => e.entryDate).sort()
    form.setValue('periodStart', dates[0]!, { shouldValidate: false })
    form.setValue('periodEnd', dates[dates.length - 1]!, { shouldValidate: false })
  }, [mode, selectedExpenseIds, eligibleQuery.data, form])

  const { submit, submitting } = useFormWithAction({
    form,
    action: async (values) => {
      if (mode === 'edit' && existing) {
        return updateExpenseReport({
          id: existing.id,
          purpose: values.purpose,
          periodStart: values.periodStart,
          periodEnd: values.periodEnd,
          businessLineId: values.businessLineId,
          projectId: values.projectId,
        })
      }
      return createExpenseReport({
        purpose: values.purpose,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        businessLineId: values.businessLineId,
        projectId: values.projectId,
        expenseIds: Array.from(selectedExpenseIds),
      })
    },
    successMessage: mode === 'create' ? 'Report created' : 'Report updated',
    onSuccess: (data) => {
      router.push(`/finance/expense-reports/${data.id}`)
      router.refresh()
    },
  })

  const eligible = eligibleQuery.data ?? []
  const selectedTotal = eligible
    .filter((e) => selectedExpenseIds.has(e.id))
    .reduce((sum, e) => sum + e.amountCents, 0)

  function toggleExpense(id: string, checked: boolean) {
    setSelectedExpenseIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
      {mode === 'create' && subjectPartyQuery.data?.displayName && (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">For:</span>{' '}
          <span className="font-medium">{subjectPartyQuery.data.displayName}</span>
        </div>
      )}

      <div>
        <Label htmlFor="purpose">Purpose</Label>
        <Input
          id="purpose"
          placeholder="Trip to Apex Systems for SAP rollout"
          {...form.register('purpose')}
        />
        {form.formState.errors.purpose && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.purpose.message}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="periodStart">Period start</Label>
          <Input id="periodStart" type="date" {...form.register('periodStart')} />
          {form.formState.errors.periodStart && (
            <p className="mt-1 text-xs text-red-600">
              {form.formState.errors.periodStart.message}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="periodEnd">Period end</Label>
          <Input id="periodEnd" type="date" {...form.register('periodEnd')} />
          {form.formState.errors.periodEnd && (
            <p className="mt-1 text-xs text-red-600">
              {form.formState.errors.periodEnd.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="businessLineId">Business line (optional)</Label>
        <Select
          value={form.watch('businessLineId') ?? 'none'}
          onValueChange={(v) =>
            form.setValue('businessLineId', v === 'none' ? null : v, {
              shouldValidate: false,
            })
          }
        >
          <SelectTrigger id="businessLineId">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Cross-line / unspecified —</SelectItem>
            {(businessLinesQuery.data ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === 'create' && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label>Attach reimbursable expenses</Label>
            {selectedExpenseIds.size > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedExpenseIds.size} selected · {formatMoney(selectedTotal)}
              </p>
            )}
          </div>

          {eligibleQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading eligible expenses…</p>
          ) : eligible.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
              No reimbursable expenses available. Mark expenses as reimbursable to attach them.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border bg-card">
              {eligible.map((e) => {
                const checked = selectedExpenseIds.has(e.id)
                return (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-0 hover:bg-accent/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggleExpense(e.id, c === true)}
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.entryDate} · {e.accountName} · {e.businessLineName}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium tabular-nums">
                        {formatMoney(e.amountCents, e.currencyCode)}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
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
              {mode === 'create' ? 'Creating…' : 'Updating…'}
            </>
          ) : mode === 'create' ? (
            'Create draft report'
          ) : (
            'Update report'
          )}
        </Button>
      </div>
    </form>
  )
}
