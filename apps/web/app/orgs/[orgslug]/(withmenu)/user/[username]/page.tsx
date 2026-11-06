import type { Metadata } from 'next'
import { getServerAccessToken } from '@/lib/auth/server'
import { publicPortfolioPage } from '@components/Pages/Portfolio/v2/portfolioPages'
import { portfolioTitle } from '@components/Pages/Portfolio/v2/portfolioTitle'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolio } from '@services/portfolio/portfolio'

type Params = { params: Promise<{ orgslug: string; username: string }> }

/** A shared link's tab and preview say whose portfolio it is. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { orgslug, username } = await params
  try {
    const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 })
    const shell = await getPublicPortfolio(org.id, username, await getServerAccessToken())
    return { title: portfolioTitle(shell.identity?.shown_name || shell.portfolio?.display_name) }
  } catch { return {} }
}

export default async function PublicPortfolioPage({ params }: Params) {
  const { orgslug, username } = await params
  return publicPortfolioPage(orgslug, username)
}
