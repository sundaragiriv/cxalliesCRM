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
import { softDeleteExpense } from '../actions/expenses'
import { ExpenseForm } from './ExpenseForm'
import { FilePreview } from '@/components/files/FilePreview'

export interface ExpenseDetailProps {
  expenseId: string
}

export function ExpenseDetail({ expenseId }: ExpenseDetailProps) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const query = trpc.finance.expenses.get.useQuery({ id: expenseId })

  async function handleDelete() {
    if (!confirm('Delete this expense? This action is reversible from the database for 30 days.')) return
    setDeleting(true)
    const result = await softDeleteExpense({ id: expenseId })
    setDeleting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Expense deleted')
    // Invalidate list + count caches so the next paint shows fresh data.
    await utils.finance.expenses.list.invalidate()
    await utils.finance.expenses.count.invalidate()
    router.push('/finance/expenses')
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
    return <p className="text-sm text-destructive">Expense not found.</p>
  }

  const expense = query.data

  if (editing) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edit expense</h1>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        <ExpenseForm
          mode="edit"
          onSuccess={() => {
            setEditing(false)
            void query.refetch()
          }}
          existing={{
            id: expense.id,
            entryDate: expense.entryDate,
            businessLineId: expense.businessLineId,
            chartOfAccountsId: expense.chartOfAccountsId,
            amountCents: expense.amountCents,
            description: expense.description,
            paymentSource: expense.paymentSource,
            corporateCardId: expense.corporateCardId,
            isBillable: expense.isBillable,
            isReimbursable: expense.isReimbursable,
            receiptFileId: expense.receiptFileId,
            notes: expense.notes,
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/finance/expenses"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to expenses
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {formatMoney(expense.amountCents, expense.currencyCode)}
          </h1>
          <p className="mt-1 text-base text-muted-foreground">{expense.description}</p>
          <p className="mt-1 text-sm text-muted-foreground">{expense.entryDate}</p>
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
              <span className="text-muted-foreground">Category: </span>
              {expense.accountName}
            </div>
            <div>
              <span className="text-muted-foreground">Business line: </span>
              {expense.businessLineName}
            </div>
            <div>
              <span className="text-muted-foreground">Payee: </span>
              {expense.payeeDisplayName ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Paid via: </span>
              {expense.paymentSource.replace(/_/g, ' ')}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {expense.isBillable && <Badge variant="outline">Billable</Badge>}
              {expense.isReimbursable && <Badge variant="outline">Reimbursable</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {expense.notes ? (
              <p className="whitespace-pre-wrap">{expense.notes}</p>
            ) : (
              <p className="text-muted-foreground">No notes.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {expense.receiptFileId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Receipt</CardTitle>
          </CardHeader>
          <CardContent>
            <FilePreview fileId={expense.receiptFileId} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
