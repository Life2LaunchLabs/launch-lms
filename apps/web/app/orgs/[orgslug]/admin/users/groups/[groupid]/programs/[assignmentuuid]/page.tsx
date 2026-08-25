import { Suspense } from 'react'
import { GroupProgramMatrix } from '@components/Admin/Programs/CohortProgramAdmin'

export default async function GroupProgramPage({ params }: { params: Promise<{ orgslug: string; groupid: string; assignmentuuid: string }> }) {
  const { orgslug, groupid, assignmentuuid } = await params
  return <Suspense><GroupProgramMatrix orgslug={orgslug} groupId={Number(groupid)} assignmentUuid={decodeURIComponent(assignmentuuid)} /></Suspense>
}
