import GroupAdminDetail from '@components/Admin/Users/GroupAdminDetail'

export default async function GroupPage({ params }: { params: Promise<{ orgslug: string; groupid: string }> }) {
  const { orgslug, groupid } = await params
  return <GroupAdminDetail orgslug={orgslug} groupId={Number(groupid)} subpage="programs" />
}
