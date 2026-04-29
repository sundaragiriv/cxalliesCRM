'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc/client'
import { ProjectForm } from './ProjectForm'

export function ProjectDetail({ projectId }: { projectId: string }) {
  const query = trpc.billing.projects.get.useQuery({ id: projectId })

  if (query.isLoading) return <Skeleton className="h-96 w-full" />
  if (!query.data) return <p className="text-sm text-muted-foreground">Project not found.</p>
  const p = query.data

  return (
    <div className="space-y-6">
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
        <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{p.projectNumber}</p>
      </div>
      <ProjectForm
        mode="edit"
        existing={{
          id: p.id,
          name: p.name,
          businessLineId: p.businessLineId,
          endClientPartyId: p.endClientPartyId,
          vendorPartyId: p.vendorPartyId,
          startDate: p.startDate,
          endDate: p.endDate,
          status: p.status,
          defaultBillableRateCents: p.defaultBillableRateCents ?? 0,
          currencyCode: p.currencyCode,
          budgetHours: p.budgetHours,
          description: p.description,
        }}
      />
    </div>
  )
}
