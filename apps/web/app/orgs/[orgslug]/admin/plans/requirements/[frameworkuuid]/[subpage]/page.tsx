import { notFound } from 'next/navigation'
import GoalsAdminRoot from '@components/Goals/admin/templates/GoalsAdminRoot'

const subpages = new Set(['details', 'levels', 'spec'])

export default async function RequirementFrameworkSubpage({ params }: { params: Promise<{ orgslug: string; frameworkuuid: string; subpage: string }> }) {
  const { orgslug, frameworkuuid, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  return <GoalsAdminRoot orgslug={orgslug} tab="requirements" requirementFrameworkUuid={decodeURIComponent(frameworkuuid)} requirementSubpage={subpage as 'details' | 'levels' | 'spec'} />
}
