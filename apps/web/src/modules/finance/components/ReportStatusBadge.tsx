import { Badge } from '@/components/ui/badge'
import type { ExpenseReportStatus } from '../lib/expense-reports/state-machine'

const VARIANTS: Record<
  ExpenseReportStatus,
  { variant: 'default' | 'secondary' | 'success' | 'warning' | 'outline'; label: string }
> = {
  draft: { variant: 'outline', label: 'Draft' },
  submitted: { variant: 'warning', label: 'Submitted' },
  approved: { variant: 'default', label: 'Approved' },
  rejected: { variant: 'outline', label: 'Rejected' },
  reimbursed: { variant: 'success', label: 'Reimbursed' },
}

export function ReportStatusBadge({ status }: { status: ExpenseReportStatus }) {
  const v = VARIANTS[status]
  return <Badge variant={v.variant}>{v.label}</Badge>
}
