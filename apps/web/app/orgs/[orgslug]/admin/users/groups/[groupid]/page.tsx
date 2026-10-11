import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

export default async function GroupPage({ params }: { params: Promise<{ orgslug: string; groupid: string }> }) {
  const { groupid } = await params
  redirect(routePaths.org.dash.users.group(groupid, 'plans'))
}
