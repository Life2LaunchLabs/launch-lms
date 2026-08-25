import { notFound } from 'next/navigation'
import GroupAdminDetail from '@components/Admin/Users/GroupAdminDetail'

const SUBPAGES = new Set(['programs', 'users', 'settings', 'reports'])

export default async function GroupDetailPage({ params }: { params: Promise<{ orgslug: string; groupid: string; subpage: string }> }) {
  const { orgslug, groupid, subpage } = await params
  if (!SUBPAGES.has(subpage)) notFound()
  return <GroupAdminDetail orgslug={orgslug} groupId={Number(groupid)} subpage={subpage} />
}
