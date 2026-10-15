import { Suspense } from 'react'
import ReviewWorkspace from '@components/Goals/admin/live/ReviewWorkspace'

export default async function GoalReviewPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <Suspense><ReviewWorkspace orgslug={orgslug} /></Suspense>
}
