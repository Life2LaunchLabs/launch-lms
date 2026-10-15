import StaffGoalDetail from '@components/Goals/admin/live/StaffGoalDetail'

export default async function StaffGoalPage({ params }: { params: Promise<{ orgslug: string; planuuid: string }> }) {
  const { orgslug, planuuid } = await params
  return <StaffGoalDetail orgslug={orgslug} goalUuid={decodeURIComponent(planuuid)} />
}
