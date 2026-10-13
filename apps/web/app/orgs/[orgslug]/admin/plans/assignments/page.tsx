import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

export default async function PlanAssignmentsRedirect() {
  redirect(routePaths.org.dash.plans())
}
