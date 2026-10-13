import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

export default async function GroupProgramRedirect({ params }: { params: Promise<{ orgslug: string; groupid: string; assignmentuuid: string }> }) {
  const { groupid, assignmentuuid } = await params
  redirect(routePaths.org.dash.users.groupPlans(groupid, decodeURIComponent(assignmentuuid)))
}
