import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { LogoutButton } from './_logout-button'

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const name = session?.user?.name ?? 'there'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">CXAllies</h1>
      <p className="text-muted-foreground">Intelligent AI/ERP Solutions — Phase 1</p>
      <p className="text-sm">Welcome, {name}.</p>
      <div className="flex gap-3">
        <Button>Get started</Button>
        <LogoutButton />
      </div>
    </main>
  )
}
