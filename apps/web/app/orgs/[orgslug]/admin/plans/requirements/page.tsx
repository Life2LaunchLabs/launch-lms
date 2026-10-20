import { RequirementsPage } from '@components/Goals/admin/GoalsAdminPages'

export default async function PlansRequirementsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <RequirementsPage orgslug={orgslug} />
}
