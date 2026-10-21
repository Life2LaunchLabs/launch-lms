import PeopleView from '@components/Admin/People/PeopleView'

export default async function PeopleChatPage({ params }: { params: Promise<{ orgslug: string; chatuuid: string }> }) {
  const { orgslug, chatuuid } = await params
  return <PeopleView orgslug={orgslug} selection={{ kind: 'chat', uuid: decodeURIComponent(chatuuid) }} />
}
