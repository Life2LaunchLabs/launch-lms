import { redirect } from 'next/navigation'
import { discoverFromLegacy } from '@services/routing/paths'

export default async function LegacyDiscoverPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(discoverFromLegacy(await props.searchParams))
}
