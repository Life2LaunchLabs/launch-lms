import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { WorkEditor } from '@components/Pages/Portfolio/PortfolioShell'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg } from '@services/config/config'

export default async function EditWorkPage({ params }: { params: Promise<{ orgslug: string; workuuid: string }> }) { const { orgslug, workuuid } = await params; const session = await getServerSession(); const token = session?.tokens?.access_token; if (!token) redirect(getUriWithOrg(orgslug, '/')); const shell = await getMyPortfolio(token); const work = shell.work.find((item: any) => item.work_uuid === workuuid); if (!work) notFound(); return <WorkEditor initialWork={work} orgslug={orgslug} /> }
