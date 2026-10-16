'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { EmptyState, PageLoader } from '@components/Goals/admin/shared'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { templateKeys, templatesApi } from '@services/goals/templates'
import { assignmentPath } from './TemplateAssignments'

/** Old assignment links open where the assignment lives now: its group's goals tab, the learner, or the goal. */
export default function AssignmentRedirect({ orgslug, assignmentUuid }: { orgslug: string; assignmentUuid: string }) {
  const router = useRouter()
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const { data, isLoading } = useSWR(orgId && token ? templateKeys.orgAssignments(orgId) : null, () => templatesApi.orgAssignments(orgId, token), { revalidateOnFocus: false })
  const assignment = (data || []).find((item) => item.assignment_uuid === assignmentUuid)
  const target = assignment ? assignmentPath(assignment) : null
  React.useEffect(() => { if (target) router.replace(getUriWithOrg(orgslug, target)) }, [orgslug, router, target])
  if (isLoading || target) return <PageLoader />
  return <div className="p-10"><EmptyState title="Assignment not found" detail="It may have ended, or you are not on its team." /></div>
}
