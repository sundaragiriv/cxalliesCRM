'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc/client'
import { formatMoney } from '../lib/format-money'
import { softDeleteRevenue } from '../actions/revenue'
import { RevenueForm } from './RevenueForm'

export interface RevenueDetailProps {
  revenueId: string
}

export function RevenueDetail({ revenueId }: RevenueDetailProps) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const query = trpc.finance.revenue.get.useQuery({ id: revenueId })
  const journalQuery = trpc.finance.revenue.journal.useQuery({ revenueId })

  async function handleDelete() {
    if (!confirm('Delete this revenue? The journal entry will be reversed (books net to zero).')) {
      return
    }
    setDeleting(true)
    const result = await softDeleteRevenue({ id: revenueId })
    setDeleting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Revenue deleted')
    await utils.finance.revenue.list.invalidate()
    await utils.finance.revenue.count.invalidate()
    router.push('/finance/revenue')
    router.refresh()
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (query.error || !query.data) {
    return <p className="text-sm text-destructive">Revenue not found.</p>
  }

  const revenue = query.data

  if (editing) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edit revenue</h1>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        <RevenueForm
          mode="edit"
          onSuccess={() => {
            setEditing(false)
            void query.refetch()
            void journalQuery.refetch()
          }}
          existing={{
            id: revenue.id,
            entryDate: revenue.entryDate,
            businessLineId: revenue.businessLineId,
            partyId: revenue.partyId,
            chartOfAccountsId: revenue.chartOfAccountsId,
            amountCents: revenue.amountCents,
            description: revenue.description,
            paymentMethod: revenue.paymentMethod,
            paymentStatus: revenue.paymentStatus,
            notes: revenue.notes,
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/finance/revenue"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to revenue
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {formatMoney(revenue.amountCents, revenue.currencyCode)}
          </h1>
          <p className="mt-1 text-base text-muted-foreground">{revenue.description}</p>
          <p className="mt-1 text-sm text-muted-foreground">{revenue.entryDate}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          <Button variant="outline" onClick={handleDelete} disabled={deleting}>
            {deleting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Account: </span>
              {revenue.accountNumber} — {revenue.accountName}
            </div>
            <div>
              <span className="text-muted-foreground">Business line: </span>
              {revenue.businessLineName}
            </div>
            <div>
              <span className="text-muted-foreground">Payer: </span>
              {revenue.payerDisplayName ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Status: </span>
              <Badge
                variant={revenue.paymentStatus === 'received' ? 'success' : 'warning'}
                className="ml-1"
              >
                {revenue.paymentStatus}
              </Badge>
            </div>
            {revenue.paymentMethod && (
              <div>
                <span className="text-muted-foreground">Method: </span>
                {revenue.paymentMethod}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {revenue.notes ? (
              <p className="whitespace-pre-wrap">{revenue.notes}</p>
            ) : (
              <p className="text-muted-foreground">No notes.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Journal entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {journalQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="space-y-4">
              {(journalQuery.data?.entries ?? []).map((entry) => {
                const lines = (journalQuery.data?.lines ?? []).filter(
                  (l) => l.journalEntryId === entry.id,
                )
                return (
                  <div key={entry.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="font-mono">{entry.entryNumber}</span>
                        {entry.isReversal && (
                          <Badge variant="warning" className="ml-2">
                            Reversal
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{entry.entryDate}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-normal">Account</th>
                          <th className="text-right font-normal">Debit</th>
                          <th className="text-right font-normal">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={line.id}>
                            <td className="py-1 font-mono">{line.chartOfAccountsId.slice(0, 8)}…</td>
                            <td className="py-1 text-right tabular-nums">
                              {line.debitCents > 0 ? formatMoney(line.debitCents, line.currencyCode) : '—'}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {line.creditCents > 0
                                ? formatMoney(line.creditCents, line.currencyCode)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
