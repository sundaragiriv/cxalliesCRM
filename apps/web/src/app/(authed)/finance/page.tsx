import Link from 'next/link'
import { ReceiptText, FileText, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function FinanceLandingPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record expenses and revenue. Run reports. Replaces QuickBooks.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/finance/expenses" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <ReceiptText className="h-6 w-6 text-primary" />
              <CardTitle className="mt-2">Expenses</CardTitle>
              <CardDescription>
                Record and track every business expense. Mobile-first, 30-second flow.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary group-hover:underline">
                Open expenses →
              </span>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full opacity-60">
          <CardHeader>
            <FileText className="h-6 w-6 text-muted-foreground" />
            <CardTitle className="mt-2">Revenue</CardTitle>
            <CardDescription>
              Records each recognized revenue event. Auto-generates journal entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-sm text-muted-foreground">Ships in P1-08</span>
          </CardContent>
        </Card>

        <Card className="h-full opacity-60">
          <CardHeader>
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
            <CardTitle className="mt-2">Reports</CardTitle>
            <CardDescription>
              Quarterly tax estimate, P&L by business line, expense breakdown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-sm text-muted-foreground">Ships in P1-22</span>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
