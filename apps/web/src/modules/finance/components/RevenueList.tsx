'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Plus, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc/client'
import { formatMoney } from '../lib/format-money'

type RevenueFilters = {
  search?: string
  businessLineId?: string
  paymentStatus?: 'expected' | 'received' | 'failed' | 'refunded'
  fromDate?: string
  toDate?: string
}

function statusBadge(status: 'expected' | 'received' | 'failed' | 'refunded') {
  switch (status) {
    case 'received':
      return <Badge variant="success">Received</Badge>
    case 'expected':
      return <Badge variant="warning">Expected</Badge>
    case 'failed':
      return <Badge variant="outline">Failed</Badge>
    case 'refunded':
      return <Badge variant="outline">Refunded</Badge>
  }
}

export function RevenueList() {
  const [filters, setFilters] = useState<RevenueFilters>({})
  const businessLinesQuery = trpc.finance.pickerOptions.businessLines.useQuery()

  const query = trpc.finance.revenue.list.useInfiniteQuery(
    {
      limit: 50,
      businessLineId: filters.businessLineId,
      paymentStatus: filters.paymentStatus,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      search: filters.search,
    },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  )

  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each revenue event posts a balanced journal entry automatically.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/finance/revenue/new">
            <Plus className="mr-2 h-5 w-5" />
            New revenue
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Description, payer, notes…"
            onBlur={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setFilters({ ...filters, search: e.currentTarget.value || undefined })
              }
            }}
            defaultValue={filters.search ?? ''}
          />
        </div>
        <div>
          <Label htmlFor="bl">Business line</Label>
          <Select
            value={filters.businessLineId ?? 'all'}
            onValueChange={(v) =>
              setFilters({ ...filters, businessLineId: v === 'all' ? undefined : v })
            }
          >
            <SelectTrigger id="bl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(businessLinesQuery.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            value={filters.paymentStatus ?? 'all'}
            onValueChange={(v) =>
              setFilters({
                ...filters,
                paymentStatus:
                  v === 'all' ? undefined : (v as RevenueFilters['paymentStatus']),
              })
            }
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="expected">Expected</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No revenue yet"
          description="Record your first revenue event. The journal entry posts automatically."
          action={
            <Button asChild size="lg">
              <Link href="/finance/revenue/new">
                <Plus className="mr-2 h-5 w-5" />
                New revenue
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-lg border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Business line</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.entryDate}</TableCell>
                    <TableCell>
                      <Link
                        href={`/finance/revenue/${row.id}`}
                        className="font-medium hover:underline"
                      >
                        {row.description}
                      </Link>
                      {row.payerDisplayName && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ← {row.payerDisplayName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{row.accountName}</TableCell>
                    <TableCell className="text-sm">{row.businessLineName}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(row.amountCents, row.currencyCode)}
                    </TableCell>
                    <TableCell>{statusBadge(row.paymentStatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {items.map((row) => (
              <Link
                key={row.id}
                href={`/finance/revenue/${row.id}`}
                className="block rounded-lg border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.entryDate} · {row.businessLineName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.accountName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatMoney(row.amountCents, row.currencyCode)}
                    </p>
                    <div className="mt-1">{statusBadge(row.paymentStatus)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {query.hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
