import { redirect } from 'next/navigation'
import { routePaths } from '@services/routing/paths'

// Learner evidence moved to the requirement framework dashboards, where a capture carries it.
export default function InsightsEvidence() {
  redirect(routePaths.org.admin.insightsScope('framework'))
}
