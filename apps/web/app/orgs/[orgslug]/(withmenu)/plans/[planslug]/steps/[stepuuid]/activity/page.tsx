import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { goalActivityApi, type GoalStepActivity } from '@services/goals/activity'
import GoalActivityPlayer from '@components/Goals/learner/GoalActivityPlayer'

export default async function GoalStepActivityPage({ params }: { params: Promise<{ orgslug: string; planslug: string; stepuuid: string }> }) {
  const { orgslug, planslug, stepuuid } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) notFound()
  const goalUuid = decodeURIComponent(planslug)
  const stepUuid = decodeURIComponent(stepuuid)
  let data: GoalStepActivity
  try {
    data = await goalActivityApi.get(goalUuid, stepUuid, token)
  } catch {
    notFound()
  }
  return <GoalActivityPlayer orgslug={orgslug} goalUuid={data.goal.goal_uuid} stepUuid={data.step.step_uuid} activity={data.activity} initialRun={data.run} />
}
