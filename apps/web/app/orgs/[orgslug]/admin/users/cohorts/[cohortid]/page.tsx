import { CohortOverview } from '@components/Admin/Programs/CohortProgramAdmin'

export default async function CohortPage({ params }: { params: Promise<{ orgslug: string; cohortid: string }> }) {
  const { orgslug, cohortid } = await params
  return <CohortOverview orgslug={orgslug} cohortId={Number(cohortid)} />
}
