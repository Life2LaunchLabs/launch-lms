import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { CustomAchievementDetail } from '@components/Objects/Profile/ProfileAchievements'
import { getUser } from '@services/users/users'
import { getUriWithOrg, routePaths } from '@services/config/config'

const CustomAchievementDetailPage = async (
  props: { params: Promise<{ orgslug: string; achievementid: string }> }
) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const userId = session?.user?.id

  if (!accessToken || !userId) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.root()))
  }

  const user = await getUser(String(userId), accessToken)

  return (
    <CustomAchievementDetail
      initialUser={user}
      orgslug={params.orgslug}
      achievementId={params.achievementid}
    />
  )
}

export default CustomAchievementDetailPage
