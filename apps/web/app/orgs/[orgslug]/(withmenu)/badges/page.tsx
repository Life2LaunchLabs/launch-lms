import { redirect } from 'next/navigation'
import { withQuery } from '@services/routing/paths'

/** Discover moved from /badges to /discover; badge and collection pages stay under /badges. */
export default async function BadgesIndexPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = Object.fromEntries(Object.entries(await props.searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  redirect(withQuery('/discover', query))
}
