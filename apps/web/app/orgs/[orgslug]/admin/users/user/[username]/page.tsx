import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ orgslug: string; username: string }>
}) {
  const { orgslug, username } = await params
  redirect(
    getUriWithOrg(
      orgslug,
      routePaths.org.dash.users.userPage(decodeURIComponent(username), 'overview')
    )
  )
}
