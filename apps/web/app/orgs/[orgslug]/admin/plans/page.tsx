import { AssignmentsPage } from '@components/Goals/admin/GoalsAdminPages'

export default async function GoalAssignmentsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <AssignmentsPage orgslug={orgslug} />
}
