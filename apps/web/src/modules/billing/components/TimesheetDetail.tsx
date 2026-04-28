'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Send,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  approveTimesheet,
  rejectTimesheet,
  reopenTimesheet,
  submitTimesheet,
} from '../actions/timesheets'
import {
  nextAllowedStates,
  type TimesheetStatus,
} from '../lib/timesheets/state-machine'
import { TimesheetStatusBadge } from './TimesheetStatusBadge'

function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function TimesheetDetail({ timesheetId }: { timesheetId: string }) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const query = trpc.billing.timesheets.get.useQuery({ id: timesheetId })
  const [pending, setPending] = useState<string | null>(null)
  const [showReject, setShowReject] = useState(false)

  if (query.isLoading) return <Skeleton className="h-96 w-full" />
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">Timesheet not found.</p>
  }
  const sheet = query.data
  const status = sheet.status as TimesheetStatus
  const allowed = nextAllowedStates(status)
  const billableTotal = sheet.entries.reduce(
    (sum, e) => sum + Number(e.hours) * (e.billableRateCents ?? 0),
    0,
  )

  async function refresh() {
    await Promise.all([
      utils.billing.timesheets.get.invalidate({ id: timesheetId }),
      utils.billing.timesheets.list.invalidate(),
      utils.billing.timeEntries.weekGrid.invalidate(),
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
          href="/billing/timesheets"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to timesheets
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Week of {sheet.weekStarting}
            </h1>
            <TimesheetStatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {sheet.submitterName ?? '—'}
          </p>
          {sheet.rejectionReason && (
            <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              Rejection reason: {sheet.rejectionReason}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums">
            {Number(sheet.totalHours).toFixed(2)}h
          </p>
          <p className="text-xs text-muted-foreground">
            {formatMoney(billableTotal)} billable
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {allowed.includes('submitted') && (
          <Button
            size="sm"
            disabled={pending !== null || sheet.entries.length === 0}
            onClick={() =>
              runAction(
                'submit',
                () => submitTimesheet({ id: sheet.id }),
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
                () => approveTimesheet({ id: sheet.id }),
                'Approved — entries ready to invoice',
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
                () => reopenTimesheet({ id: sheet.id }),
                'Reopened — back to draft',
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
        {status === 'draft' && (
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/time">Edit on grid →</Link>
          </Button>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Time entries</h2>
        {sheet.entries.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            No time entries on this timesheet yet.
          </p>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Billable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.entryDate}</TableCell>
                    <TableCell className="text-sm">{e.projectName}</TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(e.hours).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {formatMoney(e.billableRateCents, e.currencyCode)}/h
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(
                        Number(e.hours) * e.billableRateCents,
                        e.currencyCode,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <RejectDialog
        open={showReject}
        onOpenChange={setShowReject}
        onConfirm={async (reason) => {
          await runAction(
            'reject',
            () => rejectTimesheet({ id: sheet.id, reason }),
            'Timesheet rejected',
          )
          setShowReject(false)
        }}
      />
    </div>
  )
}

function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg">
        <h3 className="text-lg font-semibold">Reject timesheet</h3>
        <Label htmlFor="reject-reason" className="mt-3 block">
          Reason
        </Label>
        <Textarea
          id="reject-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
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
