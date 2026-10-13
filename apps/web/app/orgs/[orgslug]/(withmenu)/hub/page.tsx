import { redirect } from 'next/navigation'
import { hubFromLegacy } from '@services/routing/paths'

/** Hub has no page of its own anymore; it opens beside the page you're on. */
export default async function HubPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Host-relative: an absolute org URL can move the learner to another origin and drop Hub's session.
  redirect(hubFromLegacy(await props.searchParams))
}
