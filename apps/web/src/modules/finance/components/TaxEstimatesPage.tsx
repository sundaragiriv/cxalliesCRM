'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
import { recomputeTaxEstimates } from '../actions/tax-estimates'
import { MarkPaidDialog } from './MarkPaidDialog'

export function TaxEstimatesPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const currentQuery = trpc.finance.taxEstimates.getCurrentQuarter.useQuery()
  const listQuery = trpc.finance.taxEstimates.list.useQuery({ limit: 8 })

  const [markPaidId, setMarkPaidId] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)

  const currentEstimate = currentQuery.data?.estimate
  const currentQuarter = currentQuery.data?.quarter

  async function handleRecompute() {
    if (!currentQuarter) return
    setRecomputing(true)
    try {
      const result = await recomputeTaxEstimates({ year: currentQuarter.year })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Recomputed ${currentQuarter.year} estimates`)
      await utils.finance.taxEstimates.getCurrentQuarter.invalidate()
      await utils.finance.taxEstimates.list.invalidate()
      router.refresh()
    } finally {
      setRecomputing(false)
    }
  }

  const dialogEstimate = useMemo(() => {
    if (!markPaidId) return null
    return (
      currentEstimate?.id === markPaidId
        ? currentEstimate
        : (listQuery.data ?? []).find((r) => r.id === markPaidId) ?? null
    )
  }, [markPaidId, currentEstimate, listQuery.data])

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tax estimates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quarterly federal + state + self-employment tax. Auto-recomputes from your revenue
            and expenses.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRecompute}
          disabled={recomputing || !currentQuarter}
        >
          {recomputing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Recompute year
        </Button>
      </div>

      {/* Current quarter big card */}
      {currentQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !currentQuarter ? null : (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground">
                Current quarter
              </p>
              <h2 className="text-2xl font-bold">
                {currentQuarter.year} Q{currentQuarter.quarter}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {currentQuarter.periodStart} → {currentQuarter.periodEnd}
              </p>
            </div>
            <div className="text-right">
              <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                <CalendarClock className="h-3 w-3" /> Due
              </p>
              <p className="text-lg font-semibold tabular-nums">{currentQuarter.dueDate}</p>
            </div>
          </div>

          {currentEstimate ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <Tile label="Federal" amount={currentEstimate.federalEstimateCents ?? 0} />
                <Tile label="State" amount={currentEstimate.stateEstimateCents ?? 0} />
                <Tile
                  label="Self-employment"
                  amount={currentEstimate.selfEmploymentEstimateCents ?? 0}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t pt-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total estimate
                  </p>
                  <p className="text-3xl font-bold tabular-nums">
                    {formatMoney(currentEstimate.totalEstimateCents ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    From{' '}
                    <span className="font-medium text-foreground">
                      {formatMoney(currentEstimate.grossIncomeCents ?? 0)}
                    </span>{' '}
                    revenue (received) less{' '}
                    <span className="font-medium text-foreground">
                      {formatMoney(currentEstimate.deductibleExpensesCents ?? 0)}
                    </span>{' '}
                    expenses
                  </p>
                </div>
                {currentEstimate.paidAt ? (
                  <Badge variant="success">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Paid {formatMoney(currentEstimate.paidAmountCents ?? 0)}
                  </Badge>
                ) : (
                  <Button
                    onClick={() => setMarkPaidId(currentEstimate.id)}
                    disabled={(currentEstimate.totalEstimateCents ?? 0) === 0}
                  >
                    Mark paid
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="mt-6 rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
              No estimate yet for this quarter. Add a revenue or expense — the estimate computes
              automatically.
            </p>
          )}
        </div>
      )}

      {/* History */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Prior quarters</h2>
        {listQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (listQuery.data ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
            No prior estimates yet.
          </p>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quarter</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Federal</TableHead>
                  <TableHead className="text-right">State</TableHead>
                  <TableHead className="text-right">SE</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQuery.data ?? [])
                  .filter(
                    (r) =>
                      !(
                        currentQuarter &&
                        r.taxYear === currentQuarter.year &&
                        r.taxQuarter === currentQuarter.quarter
                      ),
                  )
                  .map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.taxYear} Q{row.taxQuarter}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.dueDate}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.federalEstimateCents ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.stateEstimateCents ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.selfEmploymentEstimateCents ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(row.totalEstimateCents ?? 0)}
                      </TableCell>
                      <TableCell>
                        {row.paidAt ? (
                          <Badge variant="success">
                            Paid {formatMoney(row.paidAmountCents ?? 0)}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMarkPaidId(row.id)}
                          >
                            Mark paid
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <MarkPaidDialog
        open={markPaidId !== null}
        estimate={
          dialogEstimate
            ? {
                id: dialogEstimate.id,
                taxYear: dialogEstimate.taxYear,
                taxQuarter: dialogEstimate.taxQuarter,
                federalEstimateCents: dialogEstimate.federalEstimateCents ?? 0,
                stateEstimateCents: dialogEstimate.stateEstimateCents ?? 0,
                selfEmploymentEstimateCents:
                  dialogEstimate.selfEmploymentEstimateCents ?? 0,
                totalEstimateCents: dialogEstimate.totalEstimateCents ?? 0,
              }
            : null
        }
        onClose={() => setMarkPaidId(null)}
        onSuccess={async () => {
          setMarkPaidId(null)
          await utils.finance.taxEstimates.getCurrentQuarter.invalidate()
          await utils.finance.taxEstimates.list.invalidate()
          router.refresh()
        }}
      />
    </div>
  )
}

function Tile({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(amount)}</p>
    </div>
  )
}
