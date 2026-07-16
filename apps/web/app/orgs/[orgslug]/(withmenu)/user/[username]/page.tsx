import { notFound } from 'next/navigation'
import { PortfolioShell } from '@components/Pages/Portfolio/PortfolioShell'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolio } from '@services/portfolio/portfolio'

export default async function PublicPortfolioPage({ params }: { params: Promise<{ orgslug: string; username: string }> }) { const { orgslug, username } = await params; try { const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 }); return <PortfolioShell initialShell={await getPublicPortfolio(org.id, username)} orgslug={orgslug} username={username} /> } catch { notFound() } }
