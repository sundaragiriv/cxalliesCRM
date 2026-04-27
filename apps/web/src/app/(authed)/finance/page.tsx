import { Banknote } from 'lucide-react'
import { ModulePlaceholder } from '../_placeholder'

export default function FinancePage() {
  return (
    <ModulePlaceholder
      icon={Banknote}
      title="Finance"
      ticketRange="P1-06 through P1-08"
      description="Chart of Accounts, journal entries, revenue and expense entries, expense reports, and tax estimates. Replaces QuickBooks."
    />
  )
}
