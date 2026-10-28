import { Metadata } from 'next'
import { Suspense } from 'react'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import StartFlow from '@components/Onboarding/Start/StartFlow'

export const metadata: Metadata = {
  title: 'Get started — Life2Launch',
  robots: { index: false, follow: false },
}

export default function StartPage() {
  return <Suspense fallback={<PageLoading />}><StartFlow /></Suspense>
}
