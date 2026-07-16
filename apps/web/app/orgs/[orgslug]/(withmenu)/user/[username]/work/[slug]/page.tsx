import { notFound } from 'next/navigation'
import { WorkDetail } from '@components/Pages/Portfolio/PortfolioShell'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolioWork } from '@services/portfolio/portfolio'

export default async function PublicWorkDetail({ params }: { params: Promise<{ orgslug: string; username: string; slug: string }> }) { const { orgslug, username, slug } = await params; try { const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 }); const result = await getPublicPortfolioWork(org.id, username, slug); return <WorkDetail work={result.work} portfolio={result.portfolio} orgslug={orgslug} owner={false} username={username} /> } catch { notFound() } }
