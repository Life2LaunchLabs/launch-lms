import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function CohortPage({ params }: { params: Promise<{ orgslug: string; cohortid: string }> }) {
  const { orgslug, cohortid } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.users.group(cohortid)))
}
