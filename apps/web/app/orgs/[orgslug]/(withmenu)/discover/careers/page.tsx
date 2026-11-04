import React, { Suspense } from 'react'
import type { Metadata } from 'next'
import CareerSwipe from '@components/Careers/CareerSwipe'

export const metadata: Metadata = { title: 'Career swipe', robots: { index: false, follow: false } }

/** Career swipe, a Discover tool: ten careers at a time, closest to the learner's interests first. */
export default async function CareerSwipePage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <Suspense fallback={null}><CareerSwipe orgslug={orgslug} /></Suspense>
}
