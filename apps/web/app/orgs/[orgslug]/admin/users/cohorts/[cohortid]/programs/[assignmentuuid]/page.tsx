import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function CohortProgramPage({ params }: { params: Promise<{ orgslug: string; cohortid: string; assignmentuuid: string }> }) {
  const { orgslug, cohortid, assignmentuuid } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.users.groupProgram(cohortid, assignmentuuid)))
}
