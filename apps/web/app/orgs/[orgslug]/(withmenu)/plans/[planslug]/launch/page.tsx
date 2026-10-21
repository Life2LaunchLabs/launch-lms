import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { goalLaunchApi, type GoalLaunch } from '@services/goals/launch'
import GoalLaunchPlayer from '@components/Goals/learner/GoalLaunchPlayer'

export default async function GoalLaunchPage({ params }: { params: Promise<{ orgslug: string; planslug: string }> }) {
  const { orgslug, planslug } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) notFound()
  let data: GoalLaunch
  try {
    data = await goalLaunchApi.get(decodeURIComponent(planslug), token)
  } catch {
    notFound()
  }
  return <GoalLaunchPlayer orgslug={orgslug} goalUuid={data.goal.goal_uuid} activity={data.activity} initialRun={data.run} />
}
