import AssignmentDetail from '@components/Goals/admin/assignments/AssignmentDetail'

export default async function AssignmentPage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string }> }) {
  const { orgslug, assignmentuuid } = await params
  return <AssignmentDetail orgslug={orgslug} assignmentUuid={decodeURIComponent(assignmentuuid)} />
}
