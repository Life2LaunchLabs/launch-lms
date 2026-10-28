import PeopleView from '@components/Admin/People/PeopleView'

export default async function ThreadsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <PeopleView orgslug={orgslug} selection={{ kind: 'none' }} />
}
