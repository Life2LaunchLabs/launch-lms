import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

/** Old badge catalog links: badges are earned through plans, which learners find on Discover. */
export default async function BadgesRedirect({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.discover({ type: 'plans' })))
}
