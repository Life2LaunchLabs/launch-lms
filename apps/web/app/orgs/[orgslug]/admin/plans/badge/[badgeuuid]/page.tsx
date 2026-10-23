import PlanBadgeRoute from './[subpage]/page'

export default async function PlanBadgeHome({ params, searchParams }: { params: Promise<{ orgslug: string; badgeuuid: string }>; searchParams: Promise<{ version?: string }> }) {
  const { orgslug, badgeuuid } = await params
  return PlanBadgeRoute({ params: Promise.resolve({ orgslug, badgeuuid, subpage: 'analytics' }), searchParams })
}
