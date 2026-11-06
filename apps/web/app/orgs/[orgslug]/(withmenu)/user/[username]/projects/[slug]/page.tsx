import { notFound } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { ProjectDetail } from '@components/Pages/Portfolio/PortfolioProjects'
import { VisitorPage } from '@components/Pages/Portfolio/v2/VisitorPage'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolioProject } from '@services/portfolio/portfolio'

export default async function PublicProjectDetail({ params }: { params: Promise<{ orgslug: string; username: string; slug: string }> }) {
  const { orgslug, username, slug } = await params
  let result
  try {
    const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 })
    result = await getPublicPortfolioProject(org.id, username, slug, await getServerAccessToken())
  } catch { notFound() }
  return <>
    <VisitorPage layout={result.layout} name={result.identity?.shown_name || result.portfolio?.display_name} detail={result.project.title} />
    <ProjectDetail project={result.project} portfolio={result.portfolio} layout={result.layout} orgslug={orgslug} owner={false} username={username} />
  </>
}
