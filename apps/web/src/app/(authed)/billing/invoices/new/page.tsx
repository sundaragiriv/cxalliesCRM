import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NewInvoiceRoute() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/billing/invoices"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to invoices
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New invoice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manual line entry. For project-based invoicing pulling from approved time +
          billable expenses, use <em>From project</em>.
        </p>
      </div>
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        <p className="mb-3">
          Manual invoice creation UI lands in P1-13 follow-up. For Phase 1 single-user, use the project-based flow.
        </p>
        <Button asChild>
          <Link href="/billing/invoices/new/from-project">Generate from project</Link>
        </Button>
      </div>
    </div>
  )
}
