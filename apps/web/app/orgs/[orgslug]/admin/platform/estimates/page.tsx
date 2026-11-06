import { redirect } from 'next/navigation'
import { routePaths } from '@services/routing/paths'

// Estimates was renamed Datasets: the files behind estimates, careers and schools.
export default function PlatformEstimatesPage() {
  redirect(routePaths.owner.platform.datasets())
}
