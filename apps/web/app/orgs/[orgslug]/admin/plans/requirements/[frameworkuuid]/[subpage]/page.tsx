import { notFound } from 'next/navigation'
import ProgramsAdminPage from '@components/Admin/Programs/ProgramsAdminPage'

const subpages = new Set(['details', 'levels', 'spec'])

export default async function RequirementFrameworkSubpage({ params }: { params: Promise<{ orgslug: string; frameworkuuid: string; subpage: string }> }) {
  const { orgslug, frameworkuuid, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  return <ProgramsAdminPage orgslug={orgslug} rootTab="requirements" requirementFrameworkUuid={decodeURIComponent(frameworkuuid)} requirementSubpage={subpage as 'details' | 'levels' | 'spec'} />
}
