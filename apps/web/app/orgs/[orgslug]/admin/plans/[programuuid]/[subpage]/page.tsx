import { notFound } from 'next/navigation'
import ProgramsAdminPage, { type ProgramSubpage } from '@components/Admin/Programs/ProgramsAdminPage'

const subpages = new Set<ProgramSubpage>(['overview', 'objectives', 'assignments', 'settings'])

export default async function PlanTemplateSubpage({ params }: { params: Promise<{ orgslug: string; programuuid: string; subpage: string }> }) {
  const { orgslug, programuuid, subpage } = await params
  if (!subpages.has(subpage as ProgramSubpage)) notFound()
  return <ProgramsAdminPage orgslug={orgslug} programUuid={decodeURIComponent(programuuid)} activeSubpage={subpage as ProgramSubpage} />
}
