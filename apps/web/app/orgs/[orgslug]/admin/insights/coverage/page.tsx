import { redirect } from 'next/navigation'
import { routePaths } from '@services/routing/paths'

// Coverage by plan moved to each framework's page under Plans › Requirements.
export default function InsightsCoverage() {
  redirect(routePaths.org.admin.requirements())
}
