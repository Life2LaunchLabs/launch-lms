import GoalsAdminRoot from '@components/Goals/admin/templates/GoalsAdminRoot'

export default async function GoalRequirementsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <GoalsAdminRoot orgslug={orgslug} tab="requirements" />
}
