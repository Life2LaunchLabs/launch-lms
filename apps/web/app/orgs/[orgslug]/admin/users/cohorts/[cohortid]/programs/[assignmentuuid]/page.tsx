import { Suspense } from 'react'
import { CohortProgramMatrix } from '@components/Admin/Programs/CohortProgramAdmin'

export default async function CohortProgramPage({ params }: { params: Promise<{ orgslug: string; cohortid: string; assignmentuuid: string }> }) {
  const { orgslug, cohortid, assignmentuuid } = await params
  return <Suspense><CohortProgramMatrix orgslug={orgslug} cohortId={Number(cohortid)} assignmentUuid={decodeURIComponent(assignmentuuid)} /></Suspense>
}
