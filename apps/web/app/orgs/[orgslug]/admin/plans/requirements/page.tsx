import { InsightsPage } from '@components/Goals/admin/GoalsAdminPages'

export default async function GoalInsightsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <InsightsPage orgslug={orgslug} />
}
