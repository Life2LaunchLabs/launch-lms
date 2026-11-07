import React, { Suspense } from 'react'
import type { Metadata } from 'next'
import ExploreHome from '@components/Careers/ExploreHome'

export const metadata: Metadata = { title: 'Careers that fit you', robots: { index: false, follow: false } }

/** The learner's own Explore home: careers ranked for them, the "Unlock your matches" quest and saved careers. */
export default async function ExploreHomePage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <Suspense fallback={null}><ExploreHome orgslug={orgslug} /></Suspense>
}
