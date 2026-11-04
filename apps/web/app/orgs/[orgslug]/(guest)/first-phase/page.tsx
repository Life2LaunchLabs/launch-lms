import { Metadata } from 'next'
import { Suspense } from 'react'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import FirstPhaseFlow from '@components/Onboarding/FirstPhase/FirstPhaseFlow'

export const metadata: Metadata = {
  title: 'Your first phase',
  robots: { index: false, follow: false },
}

export default function FirstPhasePage() {
  return <Suspense fallback={<PageLoading />}><FirstPhaseFlow /></Suspense>
}
