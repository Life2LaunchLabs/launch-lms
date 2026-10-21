import { redirect } from 'next/navigation'
import { routePaths, type FrameworkSubpage } from '@services/routing/paths'

const subpages = new Set(['details', 'levels', 'spec'])

// Frameworks moved to Plans › Requirements. Public URLs redirect in the proxy (legacyRedirects.ts);
// this catches the internal /orgs/<slug>/admin/insights/frameworks/... form, kept for one release.
export default async function OldRequirementFrameworkSubpage({ params }: { params: Promise<{ frameworkuuid: string; subpage: string }> }) {
  const { frameworkuuid, subpage } = await params
  redirect(routePaths.org.admin.requirementFrameworkPlans(decodeURIComponent(frameworkuuid), subpages.has(subpage) ? subpage as FrameworkSubpage : 'details'))
}
