import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { auth } from '@/lib/auth'

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect('/login')
  }

  const user = session.user as typeof session.user & { has2faEnabled?: boolean }

  return (
    <div className="min-h-screen bg-background">
      {!user.has2faEnabled && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <span>
              Two-factor authentication is recommended for the Owner role and not yet enabled.
            </span>
            <Link
              href="/2fa-setup"
              className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950"
            >
              Set up 2FA
            </Link>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
