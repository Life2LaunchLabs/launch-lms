import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function CohortProgramPage({ params }: { params: Promise<{ orgslug: string; cohortid: string; assignmentuuid: string }> }) {
  const { orgslug, cohortid, assignmentuuid } = await params
  void cohortid
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.planAssignment(decodeURIComponent(assignmentuuid))))
}
