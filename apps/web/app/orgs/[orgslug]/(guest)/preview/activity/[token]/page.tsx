import type { Metadata } from 'next'
import ActivityPreviewPage from './ActivityPreviewPage'

export const metadata: Metadata = {
  title: 'Activity preview',
  robots: { index: false, follow: false },
}

export default async function Page(props: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ embed?: string }>
}) {
  const { token } = await props.params
  const { embed } = await props.searchParams
  return <ActivityPreviewPage token={token} embedded={embed === '1'} />
}
