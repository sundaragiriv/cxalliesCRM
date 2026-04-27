import { LayoutDashboard, Banknote, Receipt, UsersRound, Settings, type LucideIcon } from 'lucide-react'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Finance', href: '/finance', icon: Banknote },
  { label: 'Billing', href: '/billing', icon: Receipt },
  { label: 'CRM', href: '/crm', icon: UsersRound },
  { label: 'Settings', href: '/settings', icon: Settings },
]
