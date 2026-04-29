'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { InvoiceStatusBadge } from './InvoiceStatusBadge'
import type { InvoiceStatus } from '../lib/invoices/state-machine'

function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function InvoiceList() {
  const [status, setStatus] = useState<string>('all')
  const query = trpc.billing.invoices.list.useQuery({
    limit: 100,
    status: status === 'all' ? undefined : (status as InvoiceStatus),
  })
  const items = query.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated from approved time and billable expenses, or created manually.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/billing/invoices/new">
              <Plus className="mr-2 h-4 w-4" />
              Manual invoice
            </Link>
          </Button>
          <Button asChild>
            <Link href="/billing/invoices/new/from-project">
              <Plus className="mr-2 h-5 w-5" />
              From project
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm md:grid-cols-3">
        <div>
          <Label htmlFor="status-filter">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="partially_paid">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="void">Void</SelectItem>
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
          icon={FileText}
          title="No invoices yet"
          description="Generate from a project's approved time + billable expenses, or create manually."
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Bill to</TableHead>
                <TableHead>Business line</TableHead>
                <TableHead>Issue / due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/billing/invoices/${row.id}`}
                      className="hover:underline"
                    >
                      {row.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{row.billToName}</TableCell>
                  <TableCell className="text-sm">{row.businessLineName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.issueDate} → {row.dueDate}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(row.totalCents, row.currencyCode)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.paidCents, row.currencyCode)}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge
                      status={row.status as InvoiceStatus}
                      dueDate={row.dueDate}
                    />
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
