import Link from 'next/link'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export interface AppShellProps {
  user: {
    name: string
    email: string
    twoFactorEnabled: boolean
  }
  children: React.ReactNode
}

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: user.name, email: user.email }} />
        {!user.twoFactorEnabled && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <span>
                Two-factor authentication is recommended for the Owner role and not yet enabled.
              </span>
              <Link
                href="/2fa-setup"
                className="font-medium underline underline-offset-2"
              >
                Set up 2FA
              </Link>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
