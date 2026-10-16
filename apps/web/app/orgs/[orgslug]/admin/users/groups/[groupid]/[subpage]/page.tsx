import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import GroupAdminDetail, { type GroupSubpage } from '@components/Admin/Users/GroupAdminDetail'
import { routePaths } from '@services/config/config'

const SUBPAGES = new Set<GroupSubpage>(['plans', 'requirements', 'members', 'settings'])
const RENAMED: Record<string, GroupSubpage> = { users: 'members', reports: 'requirements' }

export default async function GroupDetailPage({ params }: { params: Promise<{ orgslug: string; groupid: string; subpage: string }> }) {
  const { orgslug, groupid, subpage } = await params
  if (RENAMED[subpage]) redirect(routePaths.org.dash.users.group(groupid, RENAMED[subpage]))
  if (!SUBPAGES.has(subpage as GroupSubpage)) notFound()
  return <Suspense><GroupAdminDetail orgslug={orgslug} groupId={Number(groupid)} subpage={subpage as GroupSubpage} /></Suspense>
}
