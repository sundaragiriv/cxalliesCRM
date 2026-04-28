import { Badge } from '@/components/ui/badge'
import type { TimesheetStatus } from '../lib/timesheets/state-machine'

const VARIANTS: Record<
  TimesheetStatus,
  { variant: 'default' | 'secondary' | 'success' | 'warning' | 'outline'; label: string }
> = {
  draft: { variant: 'outline', label: 'Draft' },
  submitted: { variant: 'warning', label: 'Submitted' },
  approved: { variant: 'success', label: 'Approved' },
  rejected: { variant: 'outline', label: 'Rejected' },
}

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
  const v = VARIANTS[status]
  return <Badge variant={v.variant}>{v.label}</Badge>
}
