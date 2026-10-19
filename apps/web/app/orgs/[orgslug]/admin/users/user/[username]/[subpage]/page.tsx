import { notFound } from 'next/navigation'
import OrgUserDetail, { type UserSubpage } from '@components/Admin/Users/OrgUserDetail'

const subpages = new Set<UserSubpage>(['overview', 'plans', 'requirements', 'messages'])

export default async function UserDetailSubpage({ params }: { params: Promise<{ orgslug: string; username: string; subpage: string }> }) {
  const { orgslug, username, subpage } = await params
  if (!subpages.has(subpage as UserSubpage)) notFound()
  return <OrgUserDetail username={decodeURIComponent(username)} orgslug={orgslug} activeSubpage={subpage as UserSubpage} />
}
