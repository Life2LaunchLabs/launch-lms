import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import GroupAdminDetail, { type GroupSubpage } from '@components/Admin/Users/GroupAdminDetail'

const SUBPAGES = new Set<GroupSubpage>(['plans', 'members', 'settings'])

export default async function GroupDetailPage({ params }: { params: Promise<{ orgslug: string; groupid: string; subpage: string }> }) {
  const { orgslug, groupid, subpage } = await params
  if (!SUBPAGES.has(subpage as GroupSubpage)) notFound()
  return <Suspense><GroupAdminDetail orgslug={orgslug} groupId={Number(groupid)} subpage={subpage as GroupSubpage} /></Suspense>
}
