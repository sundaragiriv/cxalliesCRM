import { Bell, Search } from 'lucide-react'
import { MobileDrawer } from './MobileDrawer'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'

export interface TopbarProps {
  user: {
    name: string
    email: string
  }
}

export function Topbar({ user }: TopbarProps) {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-4">
      <MobileDrawer />

      {/* Search — visible but inert until P1-22. */}
      <div className="hidden flex-1 max-w-md md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            disabled
            aria-disabled="true"
            placeholder="Search… (coming in P1-22)"
            className="w-full rounded-md border border-input bg-muted/30 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground/70"
            style={{ pointerEvents: 'none' }}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        {/* Notifications — placeholder until Phase 2. */}
        <button
          type="button"
          aria-label="Notifications (coming in Phase 2)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={(e) => e.preventDefault()}
        >
          <Bell className="h-4 w-4" />
        </button>
        <UserMenu name={user.name} email={user.email} />
      </div>
    </header>
  )
}
