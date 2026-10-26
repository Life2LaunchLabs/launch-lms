import type { Metadata } from 'next'
import SharedCapture from '@components/Insights/SharedCapture'

export const metadata: Metadata = { title: 'Insights capture', robots: { index: false, follow: false } }

export default async function SharedCapturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SharedCapture token={decodeURIComponent(token)} />
}
