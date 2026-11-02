import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

// Projects are edited on their own page now.
export default async function EditProjectPage({ params }: { params: Promise<{ orgslug: string; projectuuid: string }> }) {
  const { orgslug, projectuuid } = await params
  redirect(getUriWithOrg(orgslug, `/portfolio/projects/${encodeURIComponent(projectuuid)}`))
}
