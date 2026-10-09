import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { hubFromLegacyResources } from '@services/routing/paths'

export default async function ResourcesPage(props: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgslug } = await props.params
  const searchParams = await props.searchParams
  redirect(getUriWithOrg(orgslug, hubFromLegacyResources(searchParams)))
}
