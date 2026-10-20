import { notFound } from 'next/navigation'
import AssignmentDetail from '@components/Goals/admin/assignments/AssignmentDetail'

export default async function AssignmentSubpage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string; subpage: string }> }) {
  const { orgslug, assignmentuuid, subpage } = await params
  if (subpage !== 'learners') notFound()
  return <AssignmentDetail orgslug={orgslug} assignmentUuid={decodeURIComponent(assignmentuuid)} tab="learners" />
}
