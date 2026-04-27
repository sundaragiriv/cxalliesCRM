import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const name = session?.user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {name}. Module dashboards land in P1-22.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-medium text-muted-foreground">Phase 1</h2>
          <p className="mt-2 text-2xl font-semibold">Foundation</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Owner-only QuickBooks replacement (6-week target).
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-medium text-muted-foreground">Modules in scope</h2>
          <p className="mt-2 text-2xl font-semibold">Finance · Billing · CRM</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Module dashboards populate as each ticket lands.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-medium text-muted-foreground">Status</h2>
          <p className="mt-2 text-2xl font-semibold">P1-05 ✓</p>
          <p className="mt-1 text-xs text-muted-foreground">
            App shell live; design tokens ready for P1-25 brand swap.
          </p>
        </div>
      </div>
    </div>
  )
}
