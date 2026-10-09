import { notFound } from 'next/navigation'
import ProgramsAdminPage from '@components/Admin/Programs/ProgramsAdminPage'

const subpages = new Set(['objectives', 'assignments', 'settings'])

export default async function PlanTemplateSubpage({ params }: { params: Promise<{ orgslug: string; programuuid: string; subpage: string }> }) {
  const { orgslug, programuuid, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  return <ProgramsAdminPage orgslug={orgslug} programUuid={decodeURIComponent(programuuid)} activeSubpage={subpage as 'objectives' | 'assignments' | 'settings'} />
}
