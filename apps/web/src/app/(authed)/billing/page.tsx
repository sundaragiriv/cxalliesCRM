import Link from 'next/link'
import { Clock, CalendarDays, FileText, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function BillingLandingPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Time, projects, invoices, payments. The revenue side of operations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/billing/time" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <Clock className="h-6 w-6 text-primary" />
              <CardTitle className="mt-2">Time</CardTitle>
              <CardDescription>
                Weekly grid for logging hours by project. Type, blur, save.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary group-hover:underline">
                Open grid →
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/billing/timesheets" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CalendarDays className="h-6 w-6 text-primary" />
              <CardTitle className="mt-2">Timesheets</CardTitle>
              <CardDescription>
                Weekly aggregations with submit / approve / reject workflow.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary group-hover:underline">
                View timesheets →
              </span>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full opacity-60">
          <CardHeader>
            <FileText className="h-6 w-6 text-muted-foreground" />
            <CardTitle className="mt-2">Invoices</CardTitle>
            <CardDescription>
              Generate invoices from approved time entries + billable expenses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-sm text-muted-foreground">Ships in P1-13</span>
          </CardContent>
        </Card>

        <Card className="h-full opacity-60">
          <CardHeader>
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
            <CardTitle className="mt-2">Project Health</CardTitle>
            <CardDescription>
              Burn, hours, invoiced, margin per project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-sm text-muted-foreground">Ships in P1-17</span>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
