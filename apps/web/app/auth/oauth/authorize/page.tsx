import type { Metadata } from 'next'
import { Suspense } from 'react'
import OAuthConsent from './OAuthConsent'

export const metadata: Metadata = {
  title: 'Connect an app — Launch LMS',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OAuthConsent />
    </Suspense>
  )
}
