import { InsightsCoveragePage } from '@components/Goals/admin/insights/InsightsPages'

export default async function InsightsCoverage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <InsightsCoveragePage orgslug={orgslug} />
}
