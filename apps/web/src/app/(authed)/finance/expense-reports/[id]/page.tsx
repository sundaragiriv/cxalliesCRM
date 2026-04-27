import { ExpenseReportDetail } from '@/modules/finance/components/ExpenseReportDetail'

export default async function ExpenseReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-5xl">
      <ExpenseReportDetail reportId={id} />
    </div>
  )
}
