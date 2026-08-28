import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function PlanAssignmentPage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string }> }) {
  const { orgslug, assignmentuuid } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.planAssignment(decodeURIComponent(assignmentuuid))))
}
