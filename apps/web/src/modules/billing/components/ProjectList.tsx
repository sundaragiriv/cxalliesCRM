'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/badge'
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

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  canceled: 'Canceled',
}

function formatMoney(cents: number | null | undefined, currency = 'USD'): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function ProjectList() {
  const [status, setStatus] = useState<string>('all')
  const query = trpc.billing.projects.list.useQuery({
    limit: 100,
    status:
      status === 'all'
        ? undefined
        : (status as
            | 'planned'
            | 'active'
            | 'on_hold'
            | 'completed'
            | 'canceled'),
  })
  const items = query.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Engagement units for billable work. Time entries and invoices link here.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/billing/projects/new">
            <Plus className="mr-2 h-5 w-5" />
            New project
          </Link>
        </Button>
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
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_hold">On hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
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
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start logging time and generating invoices."
          action={
            <Button asChild size="lg">
              <Link href="/billing/projects/new">
                <Plus className="mr-2 h-5 w-5" />
                New project
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Business line</TableHead>
                <TableHead>End client</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/billing/projects/${p.id}`}
                      className="hover:underline"
                    >
                      {p.projectNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/billing/projects/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{p.businessLineName}</TableCell>
                  <TableCell className="text-sm">{p.endClientName ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(p.defaultBillableRateCents, p.currencyCode)}/h
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABELS[p.status]}</Badge>
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
