import { Badge } from '@/components/ui/badge'
import type { InvoiceStatus } from '../lib/invoices/state-machine'
import { isOverdue } from '../lib/invoices/state-machine'

const VARIANTS: Record<
  InvoiceStatus,
  { variant: 'default' | 'secondary' | 'success' | 'warning' | 'outline'; label: string }
> = {
  draft: { variant: 'outline', label: 'Draft' },
  sent: { variant: 'default', label: 'Sent' },
  partially_paid: { variant: 'warning', label: 'Partial' },
  paid: { variant: 'success', label: 'Paid' },
  overdue: { variant: 'warning', label: 'Overdue' },
  void: { variant: 'outline', label: 'Void' },
  canceled: { variant: 'outline', label: 'Canceled' },
}

export function InvoiceStatusBadge({
  status,
  dueDate,
}: {
  status: InvoiceStatus
  dueDate?: string
}) {
  // Show "Overdue" badge when sent/partially_paid past due_date.
  const overdue = dueDate ? isOverdue(status, dueDate) : false
  if (overdue) {
    return <Badge variant="warning">Overdue</Badge>
  }
  const v = VARIANTS[status]
  return <Badge variant={v.variant}>{v.label}</Badge>
}
