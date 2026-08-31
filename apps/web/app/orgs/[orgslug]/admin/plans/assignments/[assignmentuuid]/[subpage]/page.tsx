import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { GroupProgramMatrix } from '@components/Admin/Programs/CohortProgramAdmin'

const subpages = new Set(['overview', 'progress', 'review', 'details'])

export default async function PlanAssignmentSubpage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string; subpage: string }> }) {
  const { orgslug, assignmentuuid, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  return <Suspense><GroupProgramMatrix orgslug={orgslug} assignmentUuid={decodeURIComponent(assignmentuuid)} activeSubpage={subpage as 'overview' | 'progress' | 'review' | 'details'} /></Suspense>
}
