import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { PortfolioPostPageClient } from '@components/Objects/Portfolio/ProfilePortfolio'
import { getUser } from '@services/users/users'
import { getUriWithOrg, routePaths } from '@services/config/config'

const PortfolioPostPage = async (props: {
  params: Promise<{ orgslug: string; slug: string }>
}) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const userId = session?.user?.id

  if (!accessToken || !userId) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.root()))
  }

  const user = await getUser(String(userId), accessToken)

  return (
    <PortfolioPostPageClient
      initialUser={user}
      orgslug={params.orgslug}
      postSlug={params.slug}
      mode="owner"
    />
  )
}

export default PortfolioPostPage
