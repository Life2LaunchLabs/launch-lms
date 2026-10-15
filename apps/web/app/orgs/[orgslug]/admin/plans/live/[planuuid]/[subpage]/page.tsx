import { notFound, redirect } from 'next/navigation'
import StaffGoalDetail, { STAFF_GOAL_SUBPAGES, type StaffGoalSubpage } from '@components/Goals/admin/live/StaffGoalDetail'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function StaffGoalSubpageRoute({ params }: { params: Promise<{ orgslug: string; planuuid: string; subpage: string }> }) {
  const { orgslug, planuuid, subpage } = await params
  const goalUuid = decodeURIComponent(planuuid)
  if (subpage === 'objectives') redirect(getUriWithOrg(orgslug, routePaths.org.dash.livePlan(goalUuid, 'steps')))
  if (!STAFF_GOAL_SUBPAGES.includes(subpage as StaffGoalSubpage) || subpage === 'overview') notFound()
  return <StaffGoalDetail orgslug={orgslug} goalUuid={goalUuid} activeSubpage={subpage as StaffGoalSubpage} />
}
