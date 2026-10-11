import { redirect } from 'next/navigation'
import { routePaths } from '@services/routing/paths'

// Group plans are managed from the admin side now; staff land on their own plans.
export default async function GroupPlanPage() {
  redirect(routePaths.org.plans())
}
