import StaffPlan from '@components/Goals/admin/live/StaffPlan'

export default async function StaffPlanPage({ params }: { params: Promise<{ orgslug: string; planuuid: string }> }) {
  const { orgslug, planuuid } = await params
  return <StaffPlan orgslug={orgslug} goalUuid={decodeURIComponent(planuuid)} />
}
