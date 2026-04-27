'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'

export interface SidebarNavProps {
  onNavigate?: () => void
  className?: string
}

export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="Primary">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
