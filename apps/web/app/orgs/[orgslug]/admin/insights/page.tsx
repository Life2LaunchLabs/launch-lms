import { redirect } from 'next/navigation'
import InsightsDashboard from '@components/Insights/InsightsDashboard'
import { routePaths } from '@services/routing/paths'

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ d?: string; group?: string; fw?: string }> }) {
  const { d, group, fw } = await searchParams
  // Group reports moved to /insights/reports; old links carry ?group= or ?fw=.
  if (group || fw) redirect(routePaths.org.admin.insightsReport(group || null, fw ? fw.split(',') : null))
  return <InsightsDashboard scope="org" dashboardUuid={d || null} />
}
