import LifePlanWorkspace from '@components/LifePlan/LifePlanWorkspace'

type Props = { params: Promise<{ orgslug: string; userUuid: string }> }

/** Someone's plan budget, when they shared their plans with you in their My people. Read-only. */
export default async function SharedPlanPage({ params }: Props) {
  const { orgslug, userUuid } = await params
  const of = decodeURIComponent(userUuid)
  return <LifePlanWorkspace key={of} orgslug={orgslug} of={of} />
}
