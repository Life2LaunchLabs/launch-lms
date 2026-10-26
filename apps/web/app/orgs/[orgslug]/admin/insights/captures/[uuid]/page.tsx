import { CaptureView } from '@components/Insights/Captures'

export default async function InsightsCapturePage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params
  return <CaptureView captureUuid={decodeURIComponent(uuid)} />
}
