import { redirect } from 'next/navigation'
import { routePaths } from '@services/routing/paths'

type Props = { searchParams: Promise<{ of?: string | string[] }> }

/** Life plans moved into Plans: phases, their goals and their budgets live there. Old links still land. */
export default async function LifePlanMoved({ searchParams }: Props) {
  const { of } = await searchParams
  redirect(typeof of === 'string' && of ? routePaths.org.sharedPlan(of) : routePaths.org.plans())
}
