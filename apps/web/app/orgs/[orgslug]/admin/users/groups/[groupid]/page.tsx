import { notFound, redirect } from 'next/navigation'
import PeopleView from '@components/Admin/People/PeopleView'
import { routePaths } from '@services/config/config'

export default async function GroupPage({ params, searchParams }: {
  params: Promise<{ orgslug: string; groupid: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { orgslug, groupid } = await params
  const { view } = await searchParams
  const id = Number(groupid)
  if (!Number.isInteger(id) || id <= 0) notFound()
  // A group's requirements report moved to Insights.
  if (view === 'requirements') redirect(routePaths.org.admin.insightsEvidence(id))
  return <PeopleView orgslug={orgslug} selection={{ kind: 'group', id, view: view === 'plans' ? 'plans' : undefined }} />
}
