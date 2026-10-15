import AssignmentRedirect from '@components/Goals/admin/templates/AssignmentRedirect'

export default async function GoalAssignmentPage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string }> }) {
  const { orgslug, assignmentuuid } = await params
  return <AssignmentRedirect orgslug={orgslug} assignmentUuid={decodeURIComponent(assignmentuuid)} />
}
