import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

export default async function PlanAssignmentSubpageRedirect({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string }> }) {
  const { assignmentuuid } = await params
  redirect(routePaths.org.dash.planAssignment(decodeURIComponent(assignmentuuid)))
}
