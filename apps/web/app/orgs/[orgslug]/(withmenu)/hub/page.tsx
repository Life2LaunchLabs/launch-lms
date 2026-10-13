import { redirect } from 'next/navigation'
import { coachFromLegacy } from '@services/routing/paths'

/** The pre-rename /hub URL; Coach opens beside the page you're on. */
export default async function HubPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Host-relative: an absolute org URL can move the learner to another origin and drop Coach's session.
  redirect(coachFromLegacy(await props.searchParams))
}
