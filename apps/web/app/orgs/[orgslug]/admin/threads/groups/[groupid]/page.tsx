import PeopleView from '@components/Admin/People/PeopleView'

export default async function GroupThreadPage({ params, searchParams }: { params: Promise<{ orgslug: string; groupid: string }>; searchParams: Promise<{ plan?: string; step?: string }> }) {
  const [{ orgslug, groupid }, search] = await Promise.all([params, searchParams])
  return <PeopleView orgslug={orgslug} selection={{ kind: 'thread', target: { kind: 'group', groupId: Number(groupid), plan: search.plan, step: search.step } }} />
}
