import { InvoiceDetail } from '@/modules/billing/components/InvoiceDetail'

export default async function InvoiceDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-5xl">
      <InvoiceDetail invoiceId={id} />
    </div>
  )
}
