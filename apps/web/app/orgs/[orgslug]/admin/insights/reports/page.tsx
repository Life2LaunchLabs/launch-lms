import { redirect } from 'next/navigation'
import { routePaths } from '@services/routing/paths'

// The old group report is retired (DEV-36); its addresses open the group's Insights dashboard.
export default async function InsightsReportsRoute({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group } = await searchParams
  redirect(routePaths.org.admin.insightsScope('group', group || null))
}
