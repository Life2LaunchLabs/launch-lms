import DiscoverPlanPage from '@components/Plans/discover/DiscoverPlanPage'

export default async function DiscoverPlanRoute({ params }: { params: Promise<{ orgslug: string; templateuuid: string }> }) {
  const { orgslug, templateuuid } = await params
  return <DiscoverPlanPage orgslug={orgslug} templateUuid={decodeURIComponent(templateuuid)} />
}
