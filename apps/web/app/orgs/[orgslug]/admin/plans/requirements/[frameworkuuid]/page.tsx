import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function RequirementFrameworkPage({ params }: { params: Promise<{ orgslug: string; frameworkuuid: string }> }) {
  const { orgslug, frameworkuuid } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.planRequirement(decodeURIComponent(frameworkuuid), 'details')))
}
