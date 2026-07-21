import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { PortfolioShell } from '@components/Pages/Portfolio/PortfolioShell'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function PortfolioPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) redirect(getUriWithOrg(orgslug, routePaths.org.root()))
  return <PortfolioShell initialShell={await getMyPortfolio(token)} orgslug={orgslug} username={session?.user?.username} owner />
}
