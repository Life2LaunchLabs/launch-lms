import { notFound } from 'next/navigation'
import { RequirementFrameworkPlansPage } from '@components/Goals/admin/GoalsAdminPages'

// Kept here: a value exported from a client module reaches a server component only as a reference.
const subpages = new Set(['details', 'levels', 'spec'])

// Frameworks moved here from /admin/insights/frameworks; the old URLs redirect (services/routing/legacyRedirects.ts).
export default async function RequirementFrameworkSubpage({ params }: { params: Promise<{ orgslug: string; frameworkuuid: string; subpage: string }> }) {
  const { orgslug, frameworkuuid, subpage } = await params
  if (!subpages.has(subpage)) notFound()
  return <RequirementFrameworkPlansPage orgslug={orgslug} frameworkUuid={decodeURIComponent(frameworkuuid)} subpage={subpage as 'details' | 'levels' | 'spec'} />
}
