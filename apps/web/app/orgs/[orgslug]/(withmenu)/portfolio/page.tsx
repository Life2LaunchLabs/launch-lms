import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { OwnerProfilePageClient } from '@components/Objects/Portfolio/ProfilePageClient'
import { getUser } from '@services/users/users'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'

const ProfilePage = async (props: { params: Promise<{ orgslug: string }> }) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const userId = session?.user?.id

  if (!accessToken || !userId) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.root()))
  }

  const user = await getUser(String(userId), accessToken)
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  }, accessToken)

  return <OwnerProfilePageClient initialUser={user} orgslug={params.orgslug} orgConfig={org.config} />
}

export default ProfilePage
