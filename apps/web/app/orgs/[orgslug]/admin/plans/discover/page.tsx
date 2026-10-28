import { DiscoverTab } from '@components/Plans/shell/PlansTabs'

export default async function DiscoverRoute({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ fw?: string; covers?: string }> }) {
  const { orgslug } = await params
  const { fw, covers } = await searchParams
  return <DiscoverTab orgslug={orgslug} frameworkUuid={fw || null} covers={(covers || '').split(',').filter(Boolean)} />
}
