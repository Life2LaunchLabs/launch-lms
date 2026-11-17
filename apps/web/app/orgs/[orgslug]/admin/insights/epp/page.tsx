import EppOverviewPage from '@components/Insights/EppOverviewPage'

export default async function InsightsEppPage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ group?: string }> }) {
  const [{ orgslug }, { group }] = await Promise.all([params, searchParams])
  return <EppOverviewPage orgslug={orgslug} group={group || null} />
}
