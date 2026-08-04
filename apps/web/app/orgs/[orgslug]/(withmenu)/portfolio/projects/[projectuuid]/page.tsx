import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { ProjectDetail } from '@components/Pages/Portfolio/PortfolioShell'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg } from '@services/config/config'

export default async function OwnerProjectDetail({ params }: { params: Promise<{ orgslug: string; projectuuid: string }> }) { const { orgslug, projectuuid } = await params; const session = await getServerSession(); const token = session?.tokens?.access_token; if (!token) redirect(getUriWithOrg(orgslug, '/')); const shell = await getMyPortfolio(token); const project = shell.projects.find((item: any) => item.project_uuid === projectuuid); if (!project) notFound(); return <ProjectDetail project={project} portfolio={shell.portfolio} orgslug={orgslug} owner /> }
