import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { hubFromLegacySearch } from '@services/routing/paths'

export default async function SearchPage(props: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgslug } = await props.params
  const searchParams = await props.searchParams
  redirect(getUriWithOrg(orgslug, hubFromLegacySearch(searchParams)))
}
