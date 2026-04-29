import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { InvoiceGenerateForm } from '@/modules/billing/components/InvoiceGenerateForm'

export default function GenerateInvoiceRoute() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
        <h1 className="text-3xl font-bold tracking-tight">Generate invoice from project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pulls all approved time entries and billable expenses for the project + period
          into a draft invoice. Line descriptions and unit prices snapshot at generation
          per conventions §3.13 — later edits to source rows do not change the invoice.
        </p>
      </div>
      <InvoiceGenerateForm />
    </div>
  )
}
