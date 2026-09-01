import { redirect } from 'next/navigation'
import { routePaths } from '@services/routing/paths'

export default async function GroupPlanPage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string }> }) {
  const { assignmentuuid } = await params
  redirect(routePaths.org.groupPlan(decodeURIComponent(assignmentuuid)))
}
