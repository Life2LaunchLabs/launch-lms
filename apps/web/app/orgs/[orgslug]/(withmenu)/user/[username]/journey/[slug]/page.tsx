import { notFound } from 'next/navigation'
import { JourneyDetail } from '@components/Pages/Portfolio/Journey'
import { getOrganizationContextInfoWithoutCredentials } from '@services/organizations/orgs'
import { getPublicPortfolioJourney } from '@services/portfolio/portfolio'
export default async function PublicJourneyDetailPage({ params }: { params: Promise<{ orgslug: string; username: string; slug: string }> }) { const { orgslug, username, slug } = await params; try { const org = await getOrganizationContextInfoWithoutCredentials(orgslug, { revalidate: 0 }); const result = await getPublicPortfolioJourney(org.id, username, slug); return <JourneyDetail entry={result.journey} orgslug={orgslug} owner={false} username={username}/> } catch { notFound() } }
