import { RevenueDetail } from '@/modules/finance/components/RevenueDetail'

export default async function RevenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <RevenueDetail revenueId={id} />
}
