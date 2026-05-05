import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { CustomAchievementDetail } from '@components/Objects/Profile/ProfileAchievements'
import { getUserByUsername } from '@services/users/users'
import { getUriWithOrg, routePaths } from '@services/config/config'

const UserAchievementDetailPage = async (
  props: { params: Promise<{ orgslug: string; username: string; achievementid: string }> }
) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token

  if (!accessToken) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.root()))
  }

  const user = await getUserByUsername(params.username, accessToken)

  return (
    <CustomAchievementDetail
      initialUser={user}
      orgslug={params.orgslug}
      achievementId={params.achievementid}
      profileUsername={params.username}
    />
  )
}

export default UserAchievementDetailPage
