import { ExpenseDetail } from '@/modules/finance/components/ExpenseDetail'

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ExpenseDetail expenseId={id} />
}
