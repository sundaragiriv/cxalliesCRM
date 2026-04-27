import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RevenueForm } from '@/modules/finance/components/RevenueForm'

export default function NewRevenuePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/finance/revenue"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to revenue
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New revenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The journal entry posts automatically when you save.
        </p>
      </div>
      <RevenueForm mode="create" />
    </div>
  )
}
