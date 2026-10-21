import GoalsWorkspace from '@components/Goals/learner/GoalsWorkspace'

export default async function PlansPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <GoalsWorkspace orgslug={orgslug} />
}
