import { Receipt } from 'lucide-react'
import { ModulePlaceholder } from '../_placeholder'

export default function BillingPage() {
  return (
    <ModulePlaceholder
      icon={Receipt}
      title="Billing"
      ticketRange="P1-09 through P1-13"
      description="Projects, time entries, timesheets, invoices, payments, and subscriptions."
    />
  )
}
