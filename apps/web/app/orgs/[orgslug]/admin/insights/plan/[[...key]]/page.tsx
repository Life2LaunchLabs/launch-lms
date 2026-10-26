import InsightsDashboard from '@components/Insights/InsightsDashboard'

export default async function InsightsPlanPage({ params, searchParams }: { params: Promise<{ key?: string[] }>; searchParams: Promise<{ d?: string }> }) {
  const [{ key }, { d }] = await Promise.all([params, searchParams])
  return <InsightsDashboard scope="plan" objectKey={key?.[0] ? decodeURIComponent(key[0]) : null} dashboardUuid={d || null} />
}
