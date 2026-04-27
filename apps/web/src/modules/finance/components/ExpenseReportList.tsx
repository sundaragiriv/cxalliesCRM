'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Plus, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { trpc } from '@/lib/trpc/client'
import { formatMoney } from '../lib/format-money'
import { ReportStatusBadge } from './ReportStatusBadge'
import type { ExpenseReportStatus } from '../lib/expense-reports/state-machine'

export function ExpenseReportList() {
  const [status, setStatus] = useState<ExpenseReportStatus | 'all'>('all')

  const query = trpc.finance.expenseReports.list.useQuery({
    limit: 50,
    status: status === 'all' ? undefined : status,
  })
  const items = query.data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expense reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group reimbursable expenses for approval and payout.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/finance/expense-reports/new">
            <Plus className="mr-2 h-5 w-5" />
            New report
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm md:grid-cols-3">
        <div>
          <Label htmlFor="status-filter">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ExpenseReportStatus | 'all')}
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
              <SelectItem value="reimbursed">Reimbursed</SelectItem>
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
          icon={FileSpreadsheet}
          title="No expense reports yet"
          description="Group reimbursable expenses into a report to submit for approval."
          action={
            <Button asChild size="lg">
              <Link href="/finance/expense-reports/new">
                <Plus className="mr-2 h-5 w-5" />
                New report
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden rounded-lg border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/finance/expense-reports/${row.id}`}
                        className="hover:underline"
                      >
                        {row.reportNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/finance/expense-reports/${row.id}`}
                        className="font-medium hover:underline"
                      >
                        {row.purpose}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{row.subjectPartyName ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.periodStart} → {row.periodEnd}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(row.totalCents ?? 0)}
                    </TableCell>
                    <TableCell>
                      <ReportStatusBadge status={row.status as ExpenseReportStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2 md:hidden">
            {items.map((row) => (
              <Link
                key={row.id}
                href={`/finance/expense-reports/${row.id}`}
                className="block rounded-lg border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.purpose}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {row.reportNumber} · {row.periodStart} → {row.periodEnd}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatMoney(row.totalCents ?? 0)}
                    </p>
                    <div className="mt-1">
                      <ReportStatusBadge status={row.status as ExpenseReportStatus} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
