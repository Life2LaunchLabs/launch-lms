import { DiscoverTab } from '@components/Plans/shell/PlansTabs'

export default async function DiscoverRoute({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <DiscoverTab orgslug={orgslug} />
}
