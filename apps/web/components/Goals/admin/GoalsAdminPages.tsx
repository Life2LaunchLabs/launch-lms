'use client'

import Link from 'next/link'
import React from 'react'
import AdminTabPage from '@components/Admin/AdminTabPage'
import PlansShell from '@components/Admin/Plans/PlansShell'
import { OrgAssignments } from '@components/Goals/admin/assignments/AssignmentsList'
import TemplateList from '@components/Goals/admin/templates/TemplateList'
import { RequirementFrameworkDetail } from '@components/Goals/admin/insights/RequirementFrameworkEditor'
import RequirementsExplorer from '@components/Goals/admin/insights/RequirementsExplorer'
import AdminBadgesHome from '@components/Learning/AdminBadgesHome'
import { MarketplaceBrowsePanel } from '@components/Learning/IssuingAdminShell'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import type { FrameworkSubpage } from '@services/routing/paths'

function useOrgAndToken() {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  return { orgId: Number(org?.id), token: session?.data?.tokens?.access_token }
}

// The Plans tabs. Each wraps the page that tab had before Plans, until its own screen lands.

export function AssignmentsPage({ orgslug }: { orgslug: string }) {
  return <PlansShell active="assignments"><OrgAssignments orgslug={orgslug} /></PlansShell>
}

export function TemplatesPage({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useOrgAndToken()
  return <PlansShell active="templates"><TemplateList orgslug={orgslug} orgId={orgId} token={token} /></PlansShell>
}

/** Badges: the org's badge collections, with the Discover carousel settings beside them. */
export function BadgesPage({ orgslug, orgId, collections }: { orgslug: string; orgId: number; collections: any[] }) {
  const discover = <Link href={getUriWithOrg(orgslug, '/admin/badges/discover')} className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-3 text-sm font-medium hover:bg-gray-50">Discover carousel</Link>
  return <PlansShell active="badges" actions={discover}><AdminBadgesHome orgslug={orgslug} orgId={orgId} collections={collections} /></PlansShell>
}

/** Requirements: the org's frameworks and how its templates cover them. */
export function RequirementsPage({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useOrgAndToken()
  return <PlansShell active="requirements"><RequirementsExplorer orgslug={orgslug} orgId={orgId} token={token} /></PlansShell>
}

/** Marketplace: badges other orgs share, to request to run. */
export function MarketplacePage() {
  const { orgId } = useOrgAndToken()
  return <PlansShell active="marketplace">{orgId ? <MarketplaceBrowsePanel orgId={orgId} /> : null}</PlansShell>
}

/** One requirement framework, under Plans › Requirements. */
export function RequirementFrameworkPlansPage({ orgslug, frameworkUuid, subpage }: { orgslug: string; frameworkUuid: string; subpage: Exclude<FrameworkSubpage, 'plans'> }) {
  const { orgId, token } = useOrgAndToken()
  return <AdminTabPage tab="plans"><RequirementFrameworkDetail orgslug={orgslug} orgId={orgId} token={token} frameworkUuid={frameworkUuid} activeSubpage={subpage} /></AdminTabPage>
}
