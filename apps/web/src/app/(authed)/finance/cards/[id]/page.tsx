import { CorporateCardDetail } from '@/modules/finance/components/CorporateCardDetail'

export default async function CorporateCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-2xl">
      <CorporateCardDetail cardId={id} />
    </div>
  )
}
