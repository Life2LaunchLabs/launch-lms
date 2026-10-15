import GoalsWorkspace from '@components/Goals/learner/GoalsWorkspace'

/** One goal; the ``planslug`` segment carries the goal uuid. */
export default async function GoalPage({ params }: { params: Promise<{ orgslug: string; planslug: string }> }) {
  const { orgslug, planslug } = await params
  return <GoalsWorkspace orgslug={orgslug} initialGoalUuid={decodeURIComponent(planslug)} />
}
