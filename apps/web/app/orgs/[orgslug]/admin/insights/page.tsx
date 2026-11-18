import { redirect } from 'next/navigation'
import InsightsDashboard from '@components/Insights/InsightsDashboard'
import { routePaths } from '@services/routing/paths'

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ d?: string; group?: string; fw?: string }> }) {
  const { d, group, fw } = await searchParams
  // Old group report links carry ?group= or ?fw=; the group dashboard replaced that report (DEV-36).
  if (group || fw) redirect(routePaths.org.admin.insightsScope('group', group || null))
  return <InsightsDashboard scope="org" dashboardUuid={d || null} />
}
