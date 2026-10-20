import PeopleView from '@components/Admin/People/PeopleView'

export default async function PersonPage({ params }: { params: Promise<{ orgslug: string; username: string }> }) {
  const { orgslug, username } = await params
  return <PeopleView orgslug={orgslug} selection={{ kind: 'person', username: decodeURIComponent(username) }} />
}
