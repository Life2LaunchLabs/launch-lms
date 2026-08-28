import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { GroupProgramMatrix } from '@components/Admin/Programs/CohortProgramAdmin'

const subpages = new Set(['progress', 'review', 'details', 'reports'])

export default async function PlanAssignmentSubpage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string; subpage: string }> }) {
  const { orgslug, assignmentuuid, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  return <Suspense><GroupProgramMatrix orgslug={orgslug} assignmentUuid={decodeURIComponent(assignmentuuid)} activeSubpage={subpage as 'progress' | 'review' | 'details' | 'reports'} /></Suspense>
}
