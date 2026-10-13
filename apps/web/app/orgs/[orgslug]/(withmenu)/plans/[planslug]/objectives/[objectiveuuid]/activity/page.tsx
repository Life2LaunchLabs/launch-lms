import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { planningApi } from '@services/planning/planning'
import PlanActivityPlayer from '@components/Plans/learner/PlanActivityPlayer'

export default async function PlanActivityPage({ params }: { params: Promise<{ orgslug: string; planslug: string; objectiveuuid: string }> }) {
  const { orgslug, planslug, objectiveuuid } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) notFound()
  let data: any
  try {
    data = await planningApi.objectiveActivity(decodeURIComponent(planslug), objectiveuuid, token)
  } catch {
    notFound()
  }
  return <PlanActivityPlayer orgslug={orgslug} planSlug={data.plan.slug} objectiveUuid={objectiveuuid} activity={data.activity} initialRun={data.run} />
}
