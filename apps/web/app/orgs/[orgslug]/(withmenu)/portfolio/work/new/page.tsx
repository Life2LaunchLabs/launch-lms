import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { WorkEditor } from '@components/Pages/Portfolio/PortfolioShell'
import { getUriWithOrg } from '@services/config/config'

export default async function NewWorkPage({ params }: { params: Promise<{ orgslug: string }> }) { const { orgslug } = await params; if (!(await getServerSession())?.tokens?.access_token) redirect(getUriWithOrg(orgslug, '/')); return <WorkEditor orgslug={orgslug} /> }
