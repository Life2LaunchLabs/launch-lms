import { notFound } from 'next/navigation'
import AdminLivePlanDetail, { type LivePlanSubpage } from '@components/Admin/Programs/AdminLivePlanDetail'

const subpages = new Set<LivePlanSubpage>(['overview', 'objectives', 'reviews', 'people', 'activity', 'settings'])

export default async function AdminLivePlanSubpage({ params }: { params: Promise<{ orgslug: string; planuuid: string; subpage: string }> }) {
  const { orgslug, planuuid, subpage } = await params
  if (!subpages.has(subpage as LivePlanSubpage) || subpage === 'overview') notFound()
  return <AdminLivePlanDetail orgslug={orgslug} planUuid={decodeURIComponent(planuuid)} activeSubpage={subpage as LivePlanSubpage} />
}
