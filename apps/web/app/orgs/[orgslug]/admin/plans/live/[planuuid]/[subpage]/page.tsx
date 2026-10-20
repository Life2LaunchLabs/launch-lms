import { notFound, redirect } from 'next/navigation'
import StaffGoalDetail, { type StaffGoalSubpage } from '@components/Goals/admin/live/StaffGoalDetail'
import { getUriWithOrg, routePaths } from '@services/config/config'

// Kept here: a value exported from a client module reaches a server component only as a reference.
const STAFF_GOAL_SUBPAGES: StaffGoalSubpage[] = ['overview', 'steps', 'reviews', 'people', 'activity', 'settings']

export default async function StaffGoalSubpageRoute({ params }: { params: Promise<{ orgslug: string; planuuid: string; subpage: string }> }) {
  const { orgslug, planuuid, subpage } = await params
  const goalUuid = decodeURIComponent(planuuid)
  if (subpage === 'objectives') redirect(getUriWithOrg(orgslug, routePaths.org.admin.livePlan(goalUuid, 'steps')))
  if (!STAFF_GOAL_SUBPAGES.includes(subpage as StaffGoalSubpage) || subpage === 'overview') notFound()
  return <StaffGoalDetail orgslug={orgslug} goalUuid={goalUuid} activeSubpage={subpage as StaffGoalSubpage} />
}
