import { redirect } from 'next/navigation'
import { routePaths } from '@services/routing/paths'

// The old printable group report is retired (DEV-36); a capture of the group dashboard prints instead.
export default async function InsightsReportPrint({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  redirect(routePaths.org.admin.insightsScope('group', groupId))
}
