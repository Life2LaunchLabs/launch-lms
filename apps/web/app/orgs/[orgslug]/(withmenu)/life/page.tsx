import LifePlanWorkspace from '@components/LifePlan/LifePlanWorkspace'

type Props = { searchParams: Promise<{ of?: string | string[] }> }

/** Your life plan, or with ?of=<user uuid> someone's who shared their plans with you in My people. */
export default async function LifePlanPage({ searchParams }: Props) {
  const { of } = await searchParams
  const person = typeof of === 'string' ? of : undefined
  return <LifePlanWorkspace key={person || 'mine'} of={person} />
}
