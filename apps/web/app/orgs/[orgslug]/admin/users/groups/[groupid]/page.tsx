import { notFound } from 'next/navigation'
import PeopleView from '@components/Admin/People/PeopleView'
import type { GroupView } from '@services/routing/paths'

const VIEWS = new Set<GroupView>(['plans', 'requirements'])

export default async function GroupPage({ params, searchParams }: {
  params: Promise<{ orgslug: string; groupid: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { orgslug, groupid } = await params
  const { view } = await searchParams
  const id = Number(groupid)
  if (!Number.isInteger(id) || id <= 0) notFound()
  return <PeopleView orgslug={orgslug} selection={{ kind: 'group', id, view: VIEWS.has(view as GroupView) ? view as GroupView : undefined }} />
}
