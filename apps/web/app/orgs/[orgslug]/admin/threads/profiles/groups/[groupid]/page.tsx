import { notFound, redirect } from 'next/navigation'
import ProfilePage from '@components/Threads/profiles/ProfilePage'
import { routePaths } from '@services/config/config'

export default async function GroupProfilePage({ params, searchParams }: { params: Promise<{ orgslug: string; groupid: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ orgslug, groupid }, { view }] = await Promise.all([params, searchParams])
  const id = Number(groupid)
  if (!Number.isInteger(id) || id <= 0) notFound()
  // A group's requirements report moved to Insights.
  if (view === 'requirements') redirect(routePaths.org.admin.insightsEvidence(id))
  return <ProfilePage orgslug={orgslug} selection={{ kind: 'group', groupId: id, view: view === 'plans' || view === 'join' ? view : undefined }} />
}
