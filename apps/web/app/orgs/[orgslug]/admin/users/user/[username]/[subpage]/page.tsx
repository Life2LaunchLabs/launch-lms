import { notFound } from 'next/navigation'
import OrgUserDetail from '@components/Admin/Users/OrgUserDetail'

const subpages = new Set(['overview', 'assignments', 'review'])

export default async function UserDetailSubpage({ params }: { params: Promise<{ orgslug: string; username: string; subpage: string }> }) {
  const { orgslug, username, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  return <OrgUserDetail username={decodeURIComponent(username)} orgslug={orgslug} activeSubpage={subpage as 'overview' | 'assignments' | 'review'} />
}
