import PlansWorkspace from '@components/Plans/PlansWorkspace'

export default async function PlansPage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ group?: string }> }) {
  const { orgslug } = await params
  const { group } = await searchParams
  return <PlansWorkspace orgslug={orgslug} initialGroupAssignmentUuid={group ? decodeURIComponent(group) : undefined} />
}
