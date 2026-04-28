import { TimesheetDetail } from '@/modules/billing/components/TimesheetDetail'

export default async function TimesheetDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-5xl">
      <TimesheetDetail timesheetId={id} />
    </div>
  )
}
