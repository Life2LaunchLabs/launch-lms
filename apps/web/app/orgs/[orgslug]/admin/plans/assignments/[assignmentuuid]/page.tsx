import AssignmentRedirect from '@components/Admin/Plans/AssignmentRedirect'

export default async function PlanAssignmentPage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string }> }) {
  const { orgslug, assignmentuuid } = await params
  return <AssignmentRedirect orgslug={orgslug} assignmentUuid={decodeURIComponent(assignmentuuid)} />
}
