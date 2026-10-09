import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import LearningBadgeOverview from '@components/Learning/LearningBadgeOverview'
import { getLearningPath } from '@services/learning/learning'
import { planningApi } from '@services/planning/planning'

export default async function PlanBadgePage({ params }: { params: Promise<{ orgslug: string; planslug: string; objectiveuuid: string }> }) {
  const { orgslug, planslug, objectiveuuid } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) notFound()
  try {
    const plan = await planningApi.plan(decodeURIComponent(planslug), token)
    const objective = (plan.objectives || []).find((item: any) => item.objective_uuid === objectiveuuid)
    if (!objective?.badge?.badge_uuid) notFound()
    const badgePath = await getLearningPath(
      objective.badge.badge_uuid,
      token,
      true,
      { revalidate: 0, tags: ['learning-badges', 'planning'] },
      undefined,
      undefined,
      objectiveuuid,
    )
    return <LearningBadgeOverview orgslug={orgslug} badgePath={badgePath} planObjectiveUuid={objectiveuuid} />
  } catch {
    notFound()
  }
}
