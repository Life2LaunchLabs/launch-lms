import { AssignmentsTab } from '@components/Plans/shell/PlansTabs'

export default async function AssignmentsRoute({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <AssignmentsTab orgslug={orgslug} />
}
