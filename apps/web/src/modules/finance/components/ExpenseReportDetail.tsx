'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { trpc } from '@/lib/trpc/client'
import { formatMoney } from '../lib/format-money'
import { ReportStatusBadge } from './ReportStatusBadge'
import {
  addExpensesToReport,
  approveExpenseReport,
  markReimbursed,
  rejectExpenseReport,
  removeExpensesFromReport,
  reopenExpenseReport,
  softDeleteExpenseReport,
  submitExpenseReport,
} from '../actions/expense-reports'
import {
  nextAllowedStates,
  canEditContent,
  canSoftDelete,
  type ExpenseReportStatus,
} from '../lib/expense-reports/state-machine'

export interface ExpenseReportDetailProps {
  reportId: string
}

export function ExpenseReportDetail({ reportId }: ExpenseReportDetailProps) {
  const router = useRouter()
  const reportQuery = trpc.finance.expenseReports.get.useQuery({ id: reportId })
  const journalQuery = trpc.finance.expenseReports.journal.useQuery({ reportId })
  const utils = trpc.useUtils()

  const [pending, setPending] = useState<string | null>(null)
  const [showAddExpenses, setShowAddExpenses] = useState(false)
  const [showReject, setShowReject] = useState(false)

  if (reportQuery.isLoading) {
    return <Skeleton className="h-96 w-full" />
  }
  if (!reportQuery.data) {
    return <p className="text-sm text-muted-foreground">Report not found.</p>
  }
  const report = reportQuery.data
  const status = report.status as ExpenseReportStatus
  const allowed = nextAllowedStates(status)
  const editable = canEditContent(status)
  const deletable = canSoftDelete(status)

  async function refresh() {
    await Promise.all([
      utils.finance.expenseReports.get.invalidate({ id: reportId }),
      utils.finance.expenseReports.journal.invalidate({ reportId }),
      utils.finance.expenseReports.list.invalidate(),
      utils.finance.expenses.list.invalidate(),
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
          href="/finance/expense-reports"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to reports
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{report.purpose}</h1>
            <ReportStatusBadge status={status} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {report.reportNumber} · {report.periodStart} → {report.periodEnd}
          </p>
          {report.subjectPartyName && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              For: <span className="text-foreground">{report.subjectPartyName}</span>
            </p>
          )}
          {report.businessLineName && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Business line: <span className="text-foreground">{report.businessLineName}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums">
            {formatMoney(report.totalCents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">{report.expenses.length} expense{report.expenses.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {editable && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/finance/expense-reports/${report.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
        )}
        {allowed.includes('submitted') && (
          <Button
            size="sm"
            disabled={pending !== null || report.expenses.length === 0}
            onClick={() =>
              runAction(
                'submit',
                () => submitExpenseReport({ id: report.id }),
                'Submitted for approval',
              )
            }
          >
            {pending === 'submit' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Submit
          </Button>
        )}
        {allowed.includes('approved') && (
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              runAction(
                'approve',
                () => approveExpenseReport({ id: report.id }),
                'Approved — journal posted',
              )
            }
          >
            {pending === 'approve' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Approve
          </Button>
        )}
        {allowed.includes('reimbursed') && (
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              runAction(
                'reimburse',
                () => markReimbursed({ id: report.id }),
                'Reimbursement recorded',
              )
            }
          >
            {pending === 'reimburse' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CircleDollarSign className="mr-2 h-4 w-4" />
            )}
            Mark reimbursed
          </Button>
        )}
        {allowed.includes('rejected') && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => setShowReject(true)}
          >
            <X className="mr-2 h-4 w-4" />
            Reject
          </Button>
        )}
        {allowed.includes('draft') && status === 'rejected' && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() =>
              runAction(
                'reopen',
                () => reopenExpenseReport({ id: report.id }),
                'Report reopened — back to draft',
              )
            }
          >
            {pending === 'reopen' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Reopen
          </Button>
        )}
        {deletable && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => {
              if (
                !confirm(
                  status === 'reimbursed'
                    ? 'Delete this reimbursed report? Both journal entries will be reversed.'
                    : 'Delete this report?',
                )
              ) {
                return
              }
              runAction(
                'delete',
                () => softDeleteExpenseReport({ id: report.id }),
                'Report deleted',
              ).then(() => router.push('/finance/expense-reports'))
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
      </div>

      <RejectDialog
        open={showReject}
        onOpenChange={setShowReject}
        onConfirm={async (reason) => {
          await runAction(
            'reject',
            () => rejectExpenseReport({ id: report.id, reason }),
            status === 'approved'
              ? 'Rejected — approval journal reversed'
              : 'Report rejected',
          )
          setShowReject(false)
        }}
        willReverseJournal={status === 'approved'}
      />

      {/* Expenses */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Expenses on this report</h2>
          {editable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddExpenses((s) => !s)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add expenses
            </Button>
          )}
        </div>

        {showAddExpenses && editable && (
          <AddExpensesPanel
            reportId={report.id}
            onClose={async () => {
              setShowAddExpenses(false)
              await refresh()
            }}
          />
        )}

        {report.expenses.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            No expenses on this report. {editable ? 'Add some to submit it.' : ''}
          </p>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Business line</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {editable && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.entryDate}</TableCell>
                    <TableCell>
                      <Link
                        href={`/finance/expenses/${e.id}`}
                        className="font-medium hover:underline"
                      >
                        {e.description}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{e.accountName}</TableCell>
                    <TableCell className="text-sm">{e.businessLineName}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(e.amountCents, e.currencyCode)}
                    </TableCell>
                    {editable && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending !== null}
                          onClick={() =>
                            runAction(
                              `remove-${e.id}`,
                              () =>
                                removeExpensesFromReport({
                                  reportId: report.id,
                                  expenseIds: [e.id],
                                }),
                              'Expense removed from report',
                            )
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Journal */}
      {(journalQuery.data?.entries.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Journal entries</h2>
          <p className="text-xs text-muted-foreground">
            Append-only. Approval recognizes the liability; reimbursement settles it. Reversals
            (rejection, deletion) post mirror entries — net effect zero, full audit trail preserved.
          </p>

          <div className="space-y-3">
            {journalQuery.data!.entries.map((entry) => {
              const lines = journalQuery.data!.lines.filter(
                (l) => l.journalEntryId === entry.id,
              )
              return (
                <div key={entry.id} className="rounded-lg border bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
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
                        <TableHead>Account</TableHead>
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
    </div>
  )
}

function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  willReverseJournal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
  willReverseJournal: boolean
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg">
        <h3 className="text-lg font-semibold">Reject report</h3>
        {willReverseJournal && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            This will reverse the approval journal entry — net effect zero, audit trail preserved.
          </p>
        )}
        <Label htmlFor="reject-reason" className="mt-3 block">
          Reason
        </Label>
        <Textarea
          id="reject-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Missing receipt for line 3"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
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
            Reject
          </Button>
        </div>
      </div>
    </div>
  )
}

function AddExpensesPanel({
  reportId,
  onClose,
}: {
  reportId: string
  onClose: () => void | Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)
  const eligibleQuery = trpc.finance.expenseReports.eligibleExpenses.useQuery({
    limit: 100,
  })

  const eligible = eligibleQuery.data ?? []

  async function attach() {
    if (selected.size === 0) return
    setPending(true)
    try {
      const result = await addExpensesToReport({
        reportId,
        expenseIds: Array.from(selected),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.data.attached} expense${result.data.attached === 1 ? '' : 's'} added`)
      await onClose()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      {eligible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No reimbursable expenses available to attach.
        </p>
      ) : (
        <>
          <div className="max-h-64 overflow-y-auto">
            {eligible.map((e) => {
              const checked = selected.has(e.id)
              return (
                <label
                  key={e.id}
                  className="flex cursor-pointer items-center gap-3 border-b px-2 py-1.5 last:border-0 hover:bg-accent/40"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => {
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (c === true) next.add(e.id)
                        else next.delete(e.id)
                        return next
                      })
                    }}
                  />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{e.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.entryDate} · {e.accountName}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium tabular-nums">
                      {formatMoney(e.amountCents, e.currencyCode)}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || selected.size === 0}
              onClick={attach}
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add {selected.size} expense{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
