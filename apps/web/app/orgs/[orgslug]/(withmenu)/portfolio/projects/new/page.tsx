import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg } from '@services/config/config'

export default async function NewProjectPage({ params }: { params: Promise<{ orgslug: string }> }) { const { orgslug } = await params; if (!(await getServerSession())?.tokens?.access_token) redirect(getUriWithOrg(orgslug, '/')); redirect(getUriWithOrg(orgslug, '/portfolio/projects?newProject=1')) }
