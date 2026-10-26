import { CaptureLog } from '@components/Insights/Captures'

export default async function InsightsCapturesPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams
  return <CaptureLog dashboard={d || null} />
}
