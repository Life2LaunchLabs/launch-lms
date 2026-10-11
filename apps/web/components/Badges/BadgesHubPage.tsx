import { getServerSession } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import BadgesHub from '@components/Badges/BadgesHub'
import { type BadgesPageTab } from '@components/Badges/BadgesPageShell'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg } from '@services/config/config'

export default async function BadgesHubPage({ orgslug, initialTab, choosingBadge = false }: { orgslug: string; initialTab: BadgesPageTab; choosingBadge?: boolean }) {
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  if (initialTab === 'my-badges' && !accessToken) redirect(getUriWithOrg(orgslug, '/'))
  const initialPortfolio = accessToken ? await getMyPortfolio(accessToken) : null
  return <BadgesHub orgslug={orgslug} initialTab={initialTab} choosingBadge={choosingBadge} initialPortfolio={initialPortfolio} />
}
