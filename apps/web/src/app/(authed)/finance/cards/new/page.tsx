import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CorporateCardForm } from '@/modules/finance/components/CorporateCardForm'

export default function NewCorporateCardPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/finance/cards"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to cards
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add corporate card</h1>
      </div>
      <CorporateCardForm mode="create" />
    </div>
  )
}
