import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ExpenseReportEdit } from '@/modules/finance/components/ExpenseReportEdit'

export default async function EditExpenseReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/finance/expense-reports/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to report
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit allowed only while status is <em>draft</em>. Reject and reopen to edit later.
        </p>
      </div>
      <ExpenseReportEdit reportId={id} />
    </div>
  )
}
