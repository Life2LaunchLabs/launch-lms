import PhasePage from '@components/Goals/phases/PhasePage'

type Props = { params: Promise<{ orgslug: string; phaseId: string }> }

/** One phase of the learner's plan: its goals, and its budget beside them. */
export default async function PlanPhasePage({ params }: Props) {
  const { orgslug, phaseId } = await params
  return <PhasePage orgslug={orgslug} phaseId={decodeURIComponent(phaseId)} />
}
