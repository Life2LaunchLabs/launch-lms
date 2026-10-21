import { redirect } from 'next/navigation'

// The Assignments list lives at /admin/plans in the admin shell; one assignment keeps its own page below.
export default async function GoalAssignmentsRedirect() {
  redirect('/admin/plans')
}
