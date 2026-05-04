import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { OrganizationEmailForm } from '@/modules/parties/components/OrganizationEmailForm'

export default function OrganizationEmailSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="mb-6">
        <Link
          href="/settings"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Settings
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Email settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per ADR-0007, outbound email identity (sender domain, address,
          name, message stream) lives on the organization row, not in
          deployment env. Edits here apply on the next invoice send — no
          redeploy required.
        </p>
      </div>

      <OrganizationEmailForm />
    </div>
  )
}
