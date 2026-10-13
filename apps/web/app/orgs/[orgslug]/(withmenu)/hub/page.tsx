import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { hubFromLegacy } from '@services/routing/paths'

/** Hub has no page of its own anymore; it opens beside the page you're on. */
export default async function HubPage(props: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgslug } = await props.params
  redirect(getUriWithOrg(orgslug, hubFromLegacy(await props.searchParams)))
}
