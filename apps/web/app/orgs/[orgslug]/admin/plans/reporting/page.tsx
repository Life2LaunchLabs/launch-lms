import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

export default async function PlanReportingRedirect() {
  redirect(routePaths.org.dash.planRequirements())
}
