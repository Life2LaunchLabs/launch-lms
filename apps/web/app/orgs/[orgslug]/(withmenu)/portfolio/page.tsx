import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { OwnerProfilePageClient } from '@components/Objects/Portfolio/ProfilePageClient'
import { getUser } from '@services/users/users'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgCollections } from '@services/courses/collections'

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
  let collections: any[] = []

  try {
    collections = await getOrgCollections(
      org.id,
      accessToken,
      { revalidate: 0, tags: ['collections'] }
    )
  } catch (error) {
    console.error('Failed to load collections for portfolio badges widget', {
      orgslug: params.orgslug,
      org_id: org.id,
      error,
    })
  }

  return (
    <OwnerProfilePageClient
      initialUser={user}
      orgslug={params.orgslug}
      orgConfig={org.config}
      orgId={org.id}
      collections={collections}
    />
  )
}

export default ProfilePage
