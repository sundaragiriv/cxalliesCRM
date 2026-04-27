import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ExpenseReportForm } from '@/modules/finance/components/ExpenseReportForm'

export default function NewExpenseReportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/finance/expense-reports"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to reports
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New expense report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Group reimbursable expenses for approval and payout. Status starts as <em>draft</em> —
          submit when you&apos;re ready.
        </p>
      </div>
      <ExpenseReportForm mode="create" />
    </div>
  )
}
