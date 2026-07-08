import { notFound } from 'next/navigation'
import UsersAdminPage from '@components/Admin/Users/UsersAdminPage'
import OrgUserDetail from '@components/Admin/Users/OrgUserDetail'

const SECTIONS = new Set(['groups', 'roles', 'signups', 'new', 'audit-logs'])

export default async function UsersSegmentPage({
  params,
}: {
  params: Promise<{ orgslug: string; segment: string }>
}) {
  const { orgslug, segment } = await params
  const decodedSegment = decodeURIComponent(segment)

  if (SECTIONS.has(decodedSegment)) {
    return (
      <UsersAdminPage orgslug={orgslug} section={decodedSegment} />
    )
  }

  if (!decodedSegment) notFound()
  return <OrgUserDetail username={decodedSegment} orgslug={orgslug} />
}
