import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { TimelineDetail } from '@components/Pages/Portfolio/Timeline'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg } from '@services/config/config'
import { PageTitleRegistration } from '@components/Contexts/PageTitleContext'
export default async function TimelineDetailPage({ params }: { params: Promise<{ orgslug: string; timelineuuid: string }> }) { const { orgslug, timelineuuid } = await params; const session = await getServerSession(); const token = session?.tokens?.access_token; if (!token) redirect(getUriWithOrg(orgslug, '/')); const shell = await getMyPortfolio(token); const entry = shell.timeline.find((item: any) => item.timeline_uuid === timelineuuid); if (!entry) notFound(); return <><PageTitleRegistration section="Timeline" detail={entry.title} /><TimelineDetail entry={entry} orgslug={orgslug} owner/></> }
