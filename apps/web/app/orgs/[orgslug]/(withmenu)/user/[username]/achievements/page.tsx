import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { ProfileAchievementsManager } from '@components/Objects/Profile/ProfileAchievements'
import { getUserByUsername } from '@services/users/users'
import { getUriWithOrg, routePaths } from '@services/config/config'

const UserAchievementsPage = async (
  props: { params: Promise<{ orgslug: string; username: string }> }
) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token

  if (!accessToken) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.root()))
  }

  const user = await getUserByUsername(params.username, accessToken)

  return (
    <ProfileAchievementsManager
      initialUser={user}
      orgslug={params.orgslug}
      profileUsername={params.username}
      canEdit={session?.user?.username === user.username}
    />
  )
}

export default UserAchievementsPage
