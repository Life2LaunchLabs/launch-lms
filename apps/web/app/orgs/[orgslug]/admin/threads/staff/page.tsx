import PeopleView from '@components/Admin/People/PeopleView'

export default async function StaffRoomPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <PeopleView orgslug={orgslug} selection={{ kind: 'thread', target: { kind: 'staff_room' } }} />
}
