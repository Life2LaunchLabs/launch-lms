import PlansWorkspace from '@components/Plans/PlansWorkspace'

export default async function PlanPage({ params }: { params: Promise<{ orgslug: string; planslug: string }> }) {
  const { orgslug, planslug } = await params
  return <PlansWorkspace orgslug={orgslug} initialPlanSlug={decodeURIComponent(planslug)} />
}
