import { notFound } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { TimelineDetail } from '@components/Pages/Portfolio/Timeline'
import { VisitorPage } from '@components/Pages/Portfolio/v2/VisitorPage'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolioTimeline } from '@services/portfolio/portfolio'

export default async function PublicTimelineDetailPage({ params }: { params: Promise<{ orgslug: string; username: string; slug: string }> }) {
  const { orgslug, username, slug } = await params
  let result
  try {
    const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 })
    result = await getPublicPortfolioTimeline(org.id, username, slug, await getServerAccessToken())
  } catch { notFound() }
  return <>
    <VisitorPage layout={result.layout} name={result.identity?.shown_name || result.portfolio?.display_name} detail={result.timeline.title} />
    <TimelineDetail entry={result.timeline} orgslug={orgslug} owner={false} username={username} />
  </>
}
