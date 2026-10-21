import { notFound } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/server'
import { TimelineDetail } from '@components/Pages/Portfolio/Timeline'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolioTimeline } from '@services/portfolio/portfolio'
export default async function PublicTimelineDetailPage({ params }: { params: Promise<{ orgslug: string; username: string; slug: string }> }) { const { orgslug, username, slug } = await params; try { const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 }); const result = await getPublicPortfolioTimeline(org.id, username, slug, await getServerAccessToken()); return <TimelineDetail entry={result.timeline} orgslug={orgslug} owner={false} username={username}/> } catch { notFound() } }
