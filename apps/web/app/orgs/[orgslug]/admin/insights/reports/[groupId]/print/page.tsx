import { notFound } from 'next/navigation'
import { InsightsReportPrintPage } from '@components/Goals/admin/insights/InsightsPages'
import { parseFrameworks } from '@components/Goals/admin/insights/reportRoutes'

export default async function InsightsReportPrint({ params, searchParams }: { params: Promise<{ orgslug: string; groupId: string }>; searchParams: Promise<{ fw?: string | string[] }> }) {
  const [{ orgslug, groupId }, { fw }] = await Promise.all([params, searchParams])
  const id = Number(groupId)
  if (!Number.isInteger(id) || id <= 0) notFound()
  return <InsightsReportPrintPage orgslug={orgslug} groupId={id} frameworks={parseFrameworks(fw)} />
}
