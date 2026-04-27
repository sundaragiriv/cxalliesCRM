import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export interface ModulePlaceholderProps {
  icon: LucideIcon
  title: string
  ticketRange: string
  description?: string
}

export function ModulePlaceholder({ icon, title, ticketRange, description }: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ticketRange}</p>
      </div>
      <EmptyState
        icon={icon}
        title={`${title} ships in ${ticketRange}`}
        description={
          description ??
          'This module is reserved in the navigation so the app shell stays stable while later tickets land. Track progress in docs/phase-1-tickets.md.'
        }
      />
    </div>
  )
}
