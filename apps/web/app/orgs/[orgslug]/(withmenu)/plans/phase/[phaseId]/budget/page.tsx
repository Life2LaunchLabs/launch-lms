import LifePlanWorkspace from '@components/LifePlan/LifePlanWorkspace'

type Props = { params: Promise<{ orgslug: string; phaseId: string }> }

/** A phase's budget: what comes in and goes out, and what it adds up to over time. */
export default async function PlanPhaseBudgetPage({ params }: Props) {
  const { orgslug, phaseId } = await params
  return <LifePlanWorkspace orgslug={orgslug} phaseId={decodeURIComponent(phaseId)} />
}
