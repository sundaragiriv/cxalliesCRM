'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
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
import { trpc } from '@/lib/trpc/client'
import { upsertTimeEntry } from '../actions/time-entries'
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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function shiftWeek(weekStart: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart)!
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function formatHours(hoursText: string | number | null | undefined): string {
  if (hoursText == null || hoursText === '') return ''
  const n = Number(hoursText)
  if (!Number.isFinite(n) || n === 0) return ''
  return n.toFixed(2)
}

export function TimeGridPage() {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [anyDateInWeek, setAnyDateInWeek] = useState<string>(today)

  const utils = trpc.useUtils()
  const query = trpc.billing.timeEntries.weekGrid.useQuery({ anyDateInWeek })
  const [pending, setPending] = useState<string | null>(null)
  const [showReject, setShowReject] = useState(false)

  // (projectId × entryDate) → entry, for fast cell lookup. Hoisted before
  // early returns per react-hooks/rules-of-hooks.
  type GridEntry = {
    id: string
    projectId: string
    entryDate: string
    hours: string
    description: string
    billableRateCents: number
    currencyCode: string
    status: string
    notes: string | null
    timesheetId: string | null
  }
  const entries = query.data?.entries as readonly GridEntry[] | undefined
  const cellMap = useMemo(() => {
    const m = new Map<string, GridEntry>()
    for (const e of entries ?? []) {
      m.set(`${e.projectId}|${e.entryDate}`, e)
    }
    return m
  }, [entries])

  if (query.isLoading) {
    return <Skeleton className="h-96 w-full" />
  }
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">Failed to load.</p>
  }
  const data = query.data
  const sheet = data.timesheet
  const status = (sheet?.status ?? 'draft') as TimesheetStatus
  const editable = status === 'draft' || sheet === null
  const allowed = sheet ? nextAllowedStates(status) : []

  const allProjects = [
    ...data.eligibleProjects.map((p) => ({ ...p, eligible: true })),
    ...data.staleProjects.map((p) => ({
      ...p,
      eligible: false,
      businessLineId: null,
    })),
  ]

  async function refresh() {
    await Promise.all([
      utils.billing.timeEntries.weekGrid.invalidate(),
      utils.billing.timesheets.list.invalidate(),
    ])
  }

  async function handleCellBlur(
    projectId: string,
    entryDate: string,
    rawValue: string,
    project: (typeof allProjects)[number],
  ) {
    if (!editable) return
    const trimmed = rawValue.trim()
    const existing = cellMap.get(`${projectId}|${entryDate}`)

    // Empty input on a non-existing cell — no-op.
    if (trimmed === '' && !existing) return

    // Empty input on an existing cell — soft-delete.
    if (trimmed === '' && existing) {
      setPending(`${projectId}|${entryDate}`)
      try {
        const result = await import('../actions/time-entries').then((m) =>
          m.softDeleteTimeEntry({ id: existing.id }),
        )
        if (!result.success) {
          toast.error(result.error)
          return
        }
        await refresh()
      } finally {
        setPending(null)
      }
      return
    }

    const hours = Number(trimmed)
    if (!Number.isFinite(hours) || hours <= 0) {
      toast.error('Hours must be a positive number')
      return
    }
    if (hours > 24) {
      toast.error('Hours per day cannot exceed 24')
      return
    }

    if (project.defaultBillableRateCents == null && !existing) {
      toast.error(
        `No rate set on "${project.name}". Set a default rate on the project first.`,
      )
      return
    }

    setPending(`${projectId}|${entryDate}`)
    try {
      const description = existing
        ? existing.description
        : `${project.name} — ${entryDate}`
      const result = await upsertTimeEntry({
        projectId,
        entryDate,
        hours,
        description,
        billableRateCents: existing?.billableRateCents ?? null,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      await refresh()
    } finally {
      setPending(null)
    }
  }

  async function handleSubmit() {
    if (!sheet) return
    setPending('submit')
    try {
      const result = await submitTimesheet({ id: sheet.id })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Submitted — ${result.data.entriesCascaded} entries`)
      await refresh()
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  async function handleApprove() {
    if (!sheet) return
    setPending('approve')
    try {
      const result = await approveTimesheet({ id: sheet.id })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Approved — entries ready to invoice')
      await refresh()
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  async function handleReopen() {
    if (!sheet) return
    setPending('reopen')
    try {
      const result = await reopenTimesheet({ id: sheet.id })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Reopened — back to draft')
      await refresh()
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Time</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly grid. Type hours into a cell, blur or Tab to save. Empty a cell to delete.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnyDateInWeek(shiftWeek(data.weekStart, -7))}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Prev week
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            Week of {data.weekStart}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnyDateInWeek(shiftWeek(data.weekStart, 7))}
          >
            Next week
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnyDateInWeek(today)}
          >
            Today
          </Button>
        </div>
      </div>

      {/* Status + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <TimesheetStatusBadge status={status} />
          {sheet && (
            <span className="text-sm text-muted-foreground">
              Total <span className="font-semibold tabular-nums text-foreground">{Number(sheet.totalHours).toFixed(2)}h</span>
            </span>
          )}
          {sheet?.rejectionReason && (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Reason: {sheet.rejectionReason}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {allowed.includes('submitted') && (
            <Button
              size="sm"
              disabled={pending !== null || data.entries.length === 0}
              onClick={handleSubmit}
            >
              {pending === 'submit' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Submit week
            </Button>
          )}
          {allowed.includes('approved') && (
            <Button
              size="sm"
              disabled={pending !== null}
              onClick={handleApprove}
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
              onClick={handleReopen}
            >
              {pending === 'reopen' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Reopen
            </Button>
          )}
        </div>
      </div>

      {/* The grid */}
      {allProjects.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">
          No active projects. Create a project before logging time.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-left font-medium text-muted-foreground">
                  Project
                </th>
                {data.days.map((day, i) => (
                  <th
                    key={day}
                    className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    <div>{DAY_LABELS[i]}</div>
                    <div className="font-mono text-[10px] text-muted-foreground/70">
                      {day.slice(5)}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {allProjects.map((project) => {
                const projectTotal = data.entries
                  .filter((e) => e.projectId === project.id)
                  .reduce((sum, e) => sum + Number(e.hours), 0)
                const noRate =
                  project.defaultBillableRateCents == null && project.eligible
                return (
                  <tr key={project.id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top">
                      <div className="flex flex-col">
                        <span className="font-medium">{project.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {project.businessLineName} · {project.status}
                          {!project.eligible && ' (read-only)'}
                        </span>
                        {noRate && (
                          <span className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            No rate set — rate required to log time
                          </span>
                        )}
                      </div>
                    </td>
                    {data.days.map((day) => {
                      const entry = cellMap.get(`${project.id}|${day}`)
                      const cellKey = `${project.id}|${day}`
                      const isPending = pending === cellKey
                      return (
                        <td key={day} className="p-1 text-center align-middle">
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={
                              !editable || !project.eligible || isPending
                            }
                            defaultValue={formatHours(entry?.hours)}
                            onBlur={(e) =>
                              handleCellBlur(
                                project.id,
                                day,
                                e.currentTarget.value,
                                project,
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            className="w-16 rounded border bg-background px-1 py-1 text-center font-mono text-sm tabular-nums focus:border-primary focus:outline-none disabled:bg-muted disabled:text-muted-foreground"
                            placeholder={editable && project.eligible ? '0.00' : ''}
                          />
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {projectTotal > 0 ? projectTotal.toFixed(2) : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-muted/30 font-semibold">
                <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">Daily total</td>
                {data.days.map((day) => {
                  const dayTotal = data.entries
                    .filter((e) => e.entryDate === day)
                    .reduce((sum, e) => sum + Number(e.hours), 0)
                  return (
                    <td key={day} className="px-2 py-2 text-center font-mono tabular-nums">
                      {dayTotal > 0 ? dayTotal.toFixed(2) : '—'}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right tabular-nums">
                  {data.entries
                    .reduce((sum, e) => sum + Number(e.hours), 0)
                    .toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {sheet && (
        <p className="text-xs text-muted-foreground">
          <Link
            href={`/billing/timesheets/${sheet.id}`}
            className="underline hover:text-foreground"
          >
            View timesheet detail →
          </Link>
        </p>
      )}

      <RejectDialog
        open={showReject}
        onOpenChange={setShowReject}
        onConfirm={async (reason) => {
          if (!sheet) return
          setPending('reject')
          try {
            const result = await rejectTimesheet({ id: sheet.id, reason })
            if (!result.success) {
              toast.error(result.error)
              return
            }
            toast.success('Rejected')
            await refresh()
            router.refresh()
            setShowReject(false)
          } finally {
            setPending(null)
          }
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
          placeholder="Hours need correction on Project X — see line 3"
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
