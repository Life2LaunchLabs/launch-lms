import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg } from '@services/config/config'

export default async function EditProjectPage({ params }: { params: Promise<{ orgslug: string; projectuuid: string }> }) { const { orgslug, projectuuid } = await params; if (!(await getServerSession())?.tokens?.access_token) redirect(getUriWithOrg(orgslug, '/')); redirect(`${getUriWithOrg(orgslug, '/portfolio/projects')}?editProject=${encodeURIComponent(projectuuid)}`) }
