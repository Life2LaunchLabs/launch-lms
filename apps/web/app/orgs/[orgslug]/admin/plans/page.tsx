import { PlansHome } from '@components/Plans/shell/PlansTabs'

export default async function PlansRoute({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <PlansHome orgslug={orgslug} />
}
