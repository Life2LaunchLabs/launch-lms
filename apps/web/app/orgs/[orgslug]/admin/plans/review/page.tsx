import { Suspense } from 'react'
import ReviewWorkspace from '@components/Admin/Plans/ReviewWorkspace'

export default async function PlanReviewPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <Suspense><ReviewWorkspace orgslug={orgslug} /></Suspense>
}
