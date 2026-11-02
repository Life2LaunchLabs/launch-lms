import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

// Experiences are edited on their own page now.
export default async function EditTimelinePage({ params }: { params: Promise<{ orgslug: string; timelineuuid: string }> }) {
  const { orgslug, timelineuuid } = await params
  redirect(getUriWithOrg(orgslug, `/portfolio/timeline/${encodeURIComponent(timelineuuid)}`))
}
