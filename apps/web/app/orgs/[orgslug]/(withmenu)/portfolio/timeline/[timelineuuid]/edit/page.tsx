import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg } from '@services/config/config'
export default async function EditTimelinePage({ params }: { params: Promise<{ orgslug: string; timelineuuid: string }> }) { const { orgslug, timelineuuid } = await params; if (!(await getServerSession())?.tokens?.access_token) redirect(getUriWithOrg(orgslug, '/')); redirect(`${getUriWithOrg(orgslug, '/portfolio/timeline')}?editExperience=${encodeURIComponent(timelineuuid)}`) }
