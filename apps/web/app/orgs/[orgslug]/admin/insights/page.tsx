import { InsightsReportsPage } from '@components/Goals/admin/insights/InsightsPages'
import { parseFrameworks } from '@components/Goals/admin/insights/reportRoutes'

export default async function InsightsPage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ group?: string; fw?: string | string[] }> }) {
  const [{ orgslug }, { group, fw }] = await Promise.all([params, searchParams])
  const groupId = Number(group)
  return <InsightsReportsPage orgslug={orgslug} groupId={Number.isInteger(groupId) && groupId > 0 ? groupId : null} frameworks={parseFrameworks(fw)} />
}
