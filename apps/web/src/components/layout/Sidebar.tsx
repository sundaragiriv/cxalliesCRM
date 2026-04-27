import Link from 'next/link'
import { SidebarNav } from './SidebarNav'

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          CXAllies
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarNav />
      </div>
    </aside>
  )
}
