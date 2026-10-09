import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

const subpages = new Set(['progress', 'review', 'details', 'reports'])

export default async function GroupProgramSubpage({ params }: { params: Promise<{ orgslug: string; groupid: string; assignmentuuid: string; subpage: string }> }) {
  const { orgslug, groupid, assignmentuuid, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  void groupid
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.planAssignment(decodeURIComponent(assignmentuuid), subpage)))
}
