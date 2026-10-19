import { notFound } from 'next/navigation'
import PeopleView from '@components/Admin/People/PeopleView'

export default async function GroupPage({ params }: { params: Promise<{ orgslug: string; groupid: string }> }) {
  const { orgslug, groupid } = await params
  const id = Number(groupid)
  if (!Number.isInteger(id) || id <= 0) notFound()
  return <PeopleView orgslug={orgslug} selection={{ kind: 'group', id }} />
}
