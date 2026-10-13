import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { discoverFromLegacy } from '@services/routing/paths'

export default async function LegacyDiscoverPage(props: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgslug } = await props.params
  redirect(getUriWithOrg(orgslug, discoverFromLegacy(await props.searchParams)))
}
