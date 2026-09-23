import { redirect } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { PortfolioShell } from '@components/Pages/Portfolio/PortfolioShell'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg, routePaths } from '@services/config/config'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  const token = await getServerAccessToken()
  if (!token) redirect(`${getUriWithOrg(orgslug, '/login')}?next=${encodeURIComponent(routePaths.org.portfolio())}`)
  const shell = await getMyPortfolio(token)
  return <PortfolioShell initialShell={shell} orgslug={orgslug} username={shell.portfolio?.username} owner />
}
