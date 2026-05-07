import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import ProfilePageClient from '@components/Objects/Profile/ProfilePageClient'
import { getUser } from '@services/users/users'
import { getUriWithOrg, routePaths } from '@services/config/config'

const ProfileEditPage = async (props: { params: Promise<{ orgslug: string }> }) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const userId = session?.user?.id

  if (!accessToken || !userId) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.root()))
  }

  const user = await getUser(String(userId), accessToken)

  return <ProfilePageClient initialUser={user} orgslug={params.orgslug} editMode />
}

export default ProfileEditPage
