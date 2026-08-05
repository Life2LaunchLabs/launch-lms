import { notFound } from 'next/navigation'
import { ProjectDetail } from '@components/Pages/Portfolio/PortfolioShell'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolioProject } from '@services/portfolio/portfolio'

export default async function PublicProjectDetail({ params }: { params: Promise<{ orgslug: string; username: string; slug: string }> }) { const { orgslug, username, slug } = await params; try { const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 }); const result = await getPublicPortfolioProject(org.id, username, slug); return <ProjectDetail project={result.project} portfolio={result.portfolio} orgslug={orgslug} owner={false} username={username} /> } catch { notFound() } }
