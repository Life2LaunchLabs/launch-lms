'use client'

import React from 'react'
import AdminTabPage from '@components/Admin/AdminTabPage'
import ReviewInbox from '@components/Goals/admin/live/ReviewInbox'
import RequirementsExplorer from '@components/Goals/admin/live/RequirementsExplorer'
import TemplateList from '@components/Goals/admin/templates/TemplateList'
import { RequirementFrameworkDetail } from '@components/Admin/Programs/RequirementsAdmin'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'

function useOrgAndToken() {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  return { orgId: Number(org?.id), token: session?.data?.tokens?.access_token }
}

// The plan pages each admin tab opens on until its own screen lands: Assignments is the review inbox, Insights the requirement explorer.

export function AssignmentsPage({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useOrgAndToken()
  return <AdminTabPage tab="assignments"><ReviewInbox orgslug={orgslug} orgId={orgId} token={token} /></AdminTabPage>
}

export function TemplatesPage({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useOrgAndToken()
  return <AdminTabPage tab="templates"><TemplateList orgslug={orgslug} orgId={orgId} token={token} /></AdminTabPage>
}

export function InsightsPage({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useOrgAndToken()
  return <AdminTabPage tab="insights"><RequirementsExplorer orgslug={orgslug} orgId={orgId} token={token} /></AdminTabPage>
}

export function RequirementFrameworkPage({ orgslug, frameworkUuid, subpage }: { orgslug: string; frameworkUuid: string; subpage: 'details' | 'levels' | 'spec' }) {
  const { orgId, token } = useOrgAndToken()
  return <AdminTabPage tab="insights"><RequirementFrameworkDetail orgslug={orgslug} orgId={orgId} token={token} frameworkUuid={frameworkUuid} activeSubpage={subpage} /></AdminTabPage>
}
