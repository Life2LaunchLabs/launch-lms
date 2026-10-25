import PeopleView from '@components/Admin/People/PeopleView'

type Search = { plan?: string; step?: string; assignment?: string; step_key?: string }

export default async function PersonThreadPage({ params, searchParams }: { params: Promise<{ orgslug: string; userid: string }>; searchParams: Promise<Search> }) {
  const [{ orgslug, userid }, search] = await Promise.all([params, searchParams])
  return <PeopleView orgslug={orgslug} selection={{ kind: 'thread', target: { kind: 'person', userId: Number(userid), plan: search.plan, step: search.step, assignment: search.assignment, stepKey: search.step_key } }} />
}
