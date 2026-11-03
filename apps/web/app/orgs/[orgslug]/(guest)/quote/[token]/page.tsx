import type { Metadata } from 'next'
import { QuoteRequestPage } from '@components/Pages/Portfolio/QuoteRequestPage'

export const metadata: Metadata = { title: 'Write a quote', robots: { index: false, follow: false } }

export default async function QuoteRequest({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <QuoteRequestPage token={decodeURIComponent(token)} />
}
