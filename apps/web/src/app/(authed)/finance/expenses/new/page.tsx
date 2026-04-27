import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ExpenseForm } from '@/modules/finance/components/ExpenseForm'

export default function NewExpensePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/finance/expenses"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to expenses
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New expense</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Snap a receipt, fill in the amount, save. The form pre-fills from your last entry.
        </p>
      </div>
      <ExpenseForm mode="create" />
    </div>
  )
}
