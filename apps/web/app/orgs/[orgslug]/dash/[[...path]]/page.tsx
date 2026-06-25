import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

export default async function LegacyDashRedirectPage({
  params,
}: {
  params: Promise<{ orgslug: string; path?: string[] }>
}) {
  const { orgslug, path = [] } = await params
  const suffix = path.length ? `/${path.join('/')}` : ''

  redirect(getUriWithOrg(orgslug, `/admin${suffix}`))
}
