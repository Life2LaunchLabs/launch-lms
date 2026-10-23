import { RequirementsTab } from '@components/Plans/shell/PlansTabs'

export default async function RequirementsRoute({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <RequirementsTab orgslug={orgslug} />
}
