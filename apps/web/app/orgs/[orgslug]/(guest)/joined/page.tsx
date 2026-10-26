import { Metadata } from 'next'
import { Suspense } from 'react'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import JoinedFlow from '@components/Onboarding/Joined/JoinedFlow'

export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false, follow: false },
}

export default function JoinedPage() {
  return <Suspense fallback={<PageLoading />}><JoinedFlow /></Suspense>
}
