import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { JourneyEditor } from '@components/Pages/Portfolio/Journey'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg } from '@services/config/config'
export default async function NewJourneyPage({ params }: { params: Promise<{ orgslug: string }> }) { const { orgslug } = await params; const session = await getServerSession(); const token = session?.tokens?.access_token; if (!token) redirect(getUriWithOrg(orgslug, '/')); const shell = await getMyPortfolio(token); return <JourneyEditor work={shell.work} orgslug={orgslug}/> }
