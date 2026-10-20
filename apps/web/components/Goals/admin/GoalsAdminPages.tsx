'use client'

import React from 'react'
import AdminTabPage from '@components/Admin/AdminTabPage'
import { OrgAssignments } from '@components/Goals/admin/assignments/AssignmentsList'
import TemplateList from '@components/Goals/admin/templates/TemplateList'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'

function useOrgAndToken() {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  return { orgId: Number(org?.id), token: session?.data?.tokens?.access_token }
}

// The plan pages each admin tab opens on until its own screen lands: Assignments is the review inbox.

export function AssignmentsPage({ orgslug }: { orgslug: string }) {
  // The Assignments tab shows the staff assignments list.
  return <AdminTabPage tab="assignments"><OrgAssignments orgslug={orgslug} /></AdminTabPage>
}

export function TemplatesPage({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useOrgAndToken()
  return <AdminTabPage tab="templates"><TemplateList orgslug={orgslug} orgId={orgId} token={token} /></AdminTabPage>
}
