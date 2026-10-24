import AssignmentPage from '@components/Assignments/page/AssignmentPage'

export default async function AssignmentRoute({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string }> }) {
  const { orgslug, assignmentuuid } = await params
  return <AssignmentPage orgslug={orgslug} assignmentUuid={decodeURIComponent(assignmentuuid)} />
}
