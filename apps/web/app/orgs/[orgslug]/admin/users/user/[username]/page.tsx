import PeopleView from '@components/Admin/People/PeopleView'

export default async function PersonPage({ params, searchParams }: {
  params: Promise<{ orgslug: string; username: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { orgslug, username } = await params
  const { tab } = await searchParams
  return <PeopleView orgslug={orgslug} selection={{ kind: 'person', username: decodeURIComponent(username), tab: tab === 'plans' ? 'plans' : 'message' }} />
}
