'use client'

import Link from 'next/link'
import { Plus, ReceiptText } from 'lucide-react'
import { useState } from 'react'
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
import { trpc } from '@/lib/trpc/client'
import { formatMoney } from '../lib/format-money'
import { ExpenseFilters, type ExpenseFilterState } from './ExpenseFilters'

export function ExpenseList() {
  const [filters, setFilters] = useState<ExpenseFilterState>({})

  const query = trpc.finance.expenses.list.useInfiniteQuery(
    {
      limit: 50,
      businessLineId: filters.businessLineId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      isBillable: filters.isBillable,
      isReimbursable: filters.isReimbursable,
      search: filters.search,
    },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  )

  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Record and search every business expense.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/finance/expenses/new">
            <Plus className="mr-2 h-5 w-5" />
            New expense
          </Link>
        </Button>
      </div>

      <ExpenseFilters value={filters} onChange={setFilters} />

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No expenses yet"
          description="Record your first expense — the form pre-fills with sensible defaults so it takes about 30 seconds from a phone."
          action={
            <Button asChild size="lg">
              <Link href="/finance/expenses/new">
                <Plus className="mr-2 h-5 w-5" />
                New expense
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden rounded-lg border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Business line</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer">
                    <TableCell className="font-mono text-xs">{row.entryDate}</TableCell>
                    <TableCell>
                      <Link
                        href={`/finance/expenses/${row.id}`}
                        className="font-medium hover:underline"
                      >
                        {row.description}
                      </Link>
                      {row.payeeDisplayName && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          → {row.payeeDisplayName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{row.accountName}</TableCell>
                    <TableCell className="text-sm">{row.businessLineName}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(row.amountCents, row.currencyCode)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {row.isBillable && <Badge variant="outline">Billable</Badge>}
                        {row.isReimbursable && <Badge variant="outline">Reimburse</Badge>}
                      </div>
                    </TableCell>
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
                href={`/finance/expenses/${row.id}`}
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
                    <div className="mt-1 flex justify-end gap-1">
                      {row.isBillable && <Badge variant="outline">Billable</Badge>}
                      {row.isReimbursable && <Badge variant="outline">Reimb.</Badge>}
                    </div>
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
