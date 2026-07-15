import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { JourneyDetail } from '@components/Pages/Portfolio/Journey'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg } from '@services/config/config'
export default async function JourneyDetailPage({ params }: { params: Promise<{ orgslug: string; journeyuuid: string }> }) { const { orgslug, journeyuuid } = await params; const session = await getServerSession(); const token = session?.tokens?.access_token; if (!token) redirect(getUriWithOrg(orgslug, '/')); const shell = await getMyPortfolio(token); const entry = shell.journey.find((item: any) => item.journey_uuid === journeyuuid); if (!entry) notFound(); return <JourneyDetail entry={entry} orgslug={orgslug} owner/> }
