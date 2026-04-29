import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm } from '@/modules/billing/components/ProjectForm'

export default function NewProjectRoute() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/billing/projects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to projects
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Created in <em>planned</em> status. Move to <em>active</em> when work starts.
        </p>
      </div>
      <ProjectForm mode="create" />
    </div>
  )
}
