import PlansWorkspace from '@components/Plans/PlansWorkspace'

export default async function PlansPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <PlansWorkspace orgslug={orgslug} />
}
