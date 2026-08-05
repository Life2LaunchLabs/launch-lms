import { notFound } from 'next/navigation'
import { TimelineDetail } from '@components/Pages/Portfolio/Timeline'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolioTimeline } from '@services/portfolio/portfolio'
export default async function PublicTimelineDetailPage({ params }: { params: Promise<{ orgslug: string; username: string; slug: string }> }) { const { orgslug, username, slug } = await params; try { const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 }); const result = await getPublicPortfolioTimeline(org.id, username, slug); return <TimelineDetail entry={result.timeline} orgslug={orgslug} owner={false} username={username}/> } catch { notFound() } }
