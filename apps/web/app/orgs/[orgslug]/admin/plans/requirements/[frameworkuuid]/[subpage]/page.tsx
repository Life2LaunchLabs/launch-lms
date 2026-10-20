import { notFound } from 'next/navigation'
import { RequirementFrameworkPage } from '@components/Goals/admin/GoalsAdminPages'

const subpages = new Set(['details', 'levels', 'spec'])

export default async function RequirementFrameworkSubpage({ params }: { params: Promise<{ orgslug: string; frameworkuuid: string; subpage: string }> }) {
  const { orgslug, frameworkuuid, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  return <RequirementFrameworkPage orgslug={orgslug} frameworkUuid={decodeURIComponent(frameworkuuid)} subpage={subpage as 'details' | 'levels' | 'spec'} />
}
