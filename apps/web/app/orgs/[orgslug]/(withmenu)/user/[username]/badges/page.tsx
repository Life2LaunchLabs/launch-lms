import { notFound } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { PortfolioShell } from '@components/Pages/Portfolio/PortfolioShell'
import { getPublicPortfolio } from '@services/portfolio/portfolio'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'

export default async function PublicBadgesPage({ params }: { params: Promise<{ orgslug: string; username: string }> }) {
  const { orgslug, username } = await params
  try {
    const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 })
    return <PortfolioShell initialShell={await getPublicPortfolio(org.id, username, await getServerAccessToken())} orgslug={orgslug} username={username} active="badges" />
  } catch { notFound() }
}
