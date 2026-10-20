import { InsightsEngagementPage } from '@components/Goals/admin/insights/InsightsPages'

export default async function InsightsEngagement({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <InsightsEngagementPage orgslug={orgslug} />
}
