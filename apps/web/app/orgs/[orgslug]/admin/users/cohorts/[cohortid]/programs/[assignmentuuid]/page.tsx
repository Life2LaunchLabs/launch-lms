import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

export default async function CohortProgramRedirect({ params }: { params: Promise<{ orgslug: string; cohortid: string; assignmentuuid: string }> }) {
  const { cohortid, assignmentuuid } = await params
  redirect(routePaths.org.dash.users.groupPlans(cohortid, decodeURIComponent(assignmentuuid)))
}
