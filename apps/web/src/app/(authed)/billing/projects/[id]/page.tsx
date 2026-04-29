import { ProjectDetail } from '@/modules/billing/components/ProjectDetail'

export default async function ProjectDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-3xl">
      <ProjectDetail projectId={id} />
    </div>
  )
}
