'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc/client'
import { ExpenseReportForm } from './ExpenseReportForm'

export function ExpenseReportEdit({ reportId }: { reportId: string }) {
  const query = trpc.finance.expenseReports.get.useQuery({ id: reportId })

  if (query.isLoading) return <Skeleton className="h-96 w-full" />
  if (!query.data) return <p className="text-sm text-muted-foreground">Report not found.</p>

  const r = query.data
  return (
    <ExpenseReportForm
      mode="edit"
      existing={{
        id: r.id,
        purpose: r.purpose,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        businessLineId: r.businessLineId,
        projectId: r.projectId,
      }}
    />
  )
}
