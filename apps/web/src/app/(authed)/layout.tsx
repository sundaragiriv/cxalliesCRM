import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect('/login')
  }

  const u = session.user as typeof session.user & {
    name: string
    email: string
    twoFactorEnabled?: boolean
  }

  return (
    <AppShell
      user={{
        name: u.name,
        email: u.email,
        twoFactorEnabled: u.twoFactorEnabled ?? false,
      }}
    >
      {children}
    </AppShell>
  )
}
