import { notFound, redirect } from 'next/navigation'
import OrgUserDetail from '@components/Admin/Users/OrgUserDetail'
import { getUriWithOrg, routePaths } from '@services/config/config'

const HIDDEN_SECTIONS = new Set(['grading', 'roles', 'signups', 'audit-logs'])

export default async function UsersSegmentPage({
  params,
}: {
  params: Promise<{ orgslug: string; segment: string }>
}) {
  const { orgslug, segment } = await params
  const decodedSegment = decodeURIComponent(segment)

  if (decodedSegment === 'new') {
    redirect(getUriWithOrg(orgslug, routePaths.org.dash.users.users()))
  }

  if (decodedSegment === 'groups') redirect(getUriWithOrg(orgslug, routePaths.org.dash.users.users()))

  // Kept explicit while these legacy sections are reviewed for deletion.
  if (HIDDEN_SECTIONS.has(decodedSegment)) notFound()

  if (!decodedSegment) notFound()
  return <OrgUserDetail username={decodedSegment} orgslug={orgslug} />
}
