import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { goalStoryApi, type GoalStory } from '@services/goals/story'
import GoalStoryPlayer from '@components/Goals/learner/GoalStoryPlayer'

export default async function GoalStoryPage({ params }: { params: Promise<{ orgslug: string; planslug: string }> }) {
  const { orgslug, planslug } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) notFound()
  let data: GoalStory
  try {
    data = await goalStoryApi.get(decodeURIComponent(planslug), token)
  } catch {
    notFound()
  }
  return <GoalStoryPlayer orgslug={orgslug} goalUuid={data.goal.goal_uuid} activity={data.activity} />
}
