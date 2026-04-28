'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { trpc } from '@/lib/trpc/client'
import { TimesheetStatusBadge } from './TimesheetStatusBadge'
import type { TimesheetStatus } from '../lib/timesheets/state-machine'

export function TimesheetList() {
  const [status, setStatus] = useState<TimesheetStatus | 'all'>('all')
  const query = trpc.billing.timesheets.list.useQuery({
    limit: 50,
    status: status === 'all' ? undefined : status,
  })
  const items = query.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weekly aggregations. New timesheets appear here automatically once you log hours.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm md:grid-cols-3">
        <div>
          <Label htmlFor="status-filter">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as TimesheetStatus | 'all')}
          >
            <SelectTrigger id="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No timesheets yet"
          description="Log your first hour on /billing/time and the timesheet will appear here."
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Submitter</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/billing/timesheets/${row.id}`}
                      className="hover:underline"
                    >
                      {row.weekStarting}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.submitterName ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {Number(row.totalHours).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <TimesheetStatusBadge
                      status={row.status as TimesheetStatus}
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {row.updatedAt
                      ? new Date(row.updatedAt).toISOString().slice(0, 10)
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
