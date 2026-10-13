import { notFound, redirect } from 'next/navigation'
import OrgUserDetail, { type UserSubpage } from '@components/Admin/Users/OrgUserDetail'
import { routePaths } from '@services/config/config'

const subpages = new Set<UserSubpage>(['overview', 'plans', 'requirements'])
const RENAMED: Record<string, string> = { assignments: 'plans', review: 'overview' }

export default async function UserDetailSubpage({ params }: { params: Promise<{ orgslug: string; username: string; subpage: string }> }) {
  const { orgslug, username, subpage } = await params
  if (RENAMED[subpage]) redirect(routePaths.org.dash.users.userPage(decodeURIComponent(username), RENAMED[subpage]))
  if (!subpages.has(subpage as UserSubpage)) notFound()
  return <OrgUserDetail username={decodeURIComponent(username)} orgslug={orgslug} activeSubpage={subpage as UserSubpage} />
}
