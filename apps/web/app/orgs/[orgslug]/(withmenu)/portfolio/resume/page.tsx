import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getUser } from '@services/users/users'
import ProfileResumeClient from './ProfileResumeClient'

const ProfileResumePage = async (props: { params: Promise<{ orgslug: string }> }) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const userId = session?.user?.id

  if (!accessToken || !userId) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.root()))
  }

  const user = await getUser(String(userId), accessToken)

  return (
    <ProfileResumeClient
      initialUser={user}
      orgslug={params.orgslug}
      accessToken={accessToken}
      mode="owner"
    />
  )
}

export default ProfileResumePage
