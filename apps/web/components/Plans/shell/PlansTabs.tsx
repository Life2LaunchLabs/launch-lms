'use client'

import React from 'react'
import AdminTabPage from '@components/Admin/AdminTabPage'
import AssignmentsList from '@components/Assignments/list/AssignmentsList'
import FrameworkPage from '@components/Requirements/FrameworkPage'
import FrameworkList from '@components/Goals/admin/requirements/FrameworkList'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import DiscoverHome from '@components/Plans/discover/DiscoverHome'
import MarketplaceRequests from '@components/Plans/requests/MarketplaceRequests'
import PlanLibrary, { LibraryLoading, usePlanLibrary } from '@components/Plans/library/PlanLibrary'
import type { FrameworkSubpage } from '@services/routing/paths'
import PlansPage from './PlansPage'
import PlansWelcome from './PlansWelcome'

// The Plans area's pages. Each route under app/orgs/[orgslug]/admin/plans renders one of these.

/** Plans: the org's plans and collections, or the welcome before it has any. */
export function PlansHome({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useStaff()
  const library = usePlanLibrary(orgId, token)
  if (library && !library.plans.length && !library.collections.length) return <PlansWelcome orgslug={orgslug} />
  return <PlansPage tab="plans">{library ? <PlanLibrary orgslug={orgslug} orgId={orgId} token={token} library={library} /> : <LibraryLoading />}</PlansPage>
}

export function DiscoverTab({ orgslug, frameworkUuid = null, covers = [] }: { orgslug: string; frameworkUuid?: string | null; covers?: string[] }) {
  return <PlansPage tab="discover"><DiscoverHome orgslug={orgslug} frameworkUuid={frameworkUuid} covers={covers} /></PlansPage>
}

export function AssignmentsTab({ orgslug }: { orgslug: string }) {
  return <PlansPage tab="assignments"><AssignmentsList orgslug={orgslug} /></PlansPage>
}

export function RequirementsTab({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useStaff()
  return <PlansPage tab="requirements"><FrameworkList orgslug={orgslug} orgId={orgId} token={token} /></PlansPage>
}

/** Requests: other organizations asking to run your plans, and what you asked for (admins). */
export function RequestsTab() {
  return <PlansPage tab="requests"><MarketplaceRequests /></PlansPage>
}

/** One requirement framework, under Plans › Requirements: coverage by plan, details, levels and spec. */
export function RequirementFrameworkPage({ orgslug, frameworkUuid, subpage }: { orgslug: string; frameworkUuid: string; subpage: FrameworkSubpage }) {
  const { orgId, token } = useStaff()
  return <AdminTabPage tab="plans"><FrameworkPage orgslug={orgslug} orgId={orgId} token={token} frameworkUuid={frameworkUuid} editing={subpage === 'edit'} /></AdminTabPage>
}
