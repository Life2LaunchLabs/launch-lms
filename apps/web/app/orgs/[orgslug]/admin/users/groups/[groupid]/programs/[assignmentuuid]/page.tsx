import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function GroupProgramPage({ params }: { params: Promise<{ orgslug: string; groupid: string; assignmentuuid: string }> }) {
  const { orgslug, groupid, assignmentuuid } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.users.groupProgram(groupid, decodeURIComponent(assignmentuuid), 'progress')))
}
