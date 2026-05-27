import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { PortfolioPostPageClient } from '@components/Objects/Profile/ProfilePortfolio'
import { getUserByUsername } from '@services/users/users'

const UserPortfolioPostPage = async (props: {
  params: Promise<{ orgslug: string; username: string; slug: string }>
}) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token

  if (!accessToken) {
    redirect(`/orgs/${params.orgslug}/login?redirect=/orgs/${params.orgslug}/user/${params.username}/portfolio/${params.slug}`)
  }

  const user = await getUserByUsername(params.username, accessToken)

  return (
    <PortfolioPostPageClient
      initialUser={user}
      orgslug={params.orgslug}
      postSlug={params.slug}
      mode="public"
      profileUsername={params.username}
    />
  )
}

export default UserPortfolioPostPage
