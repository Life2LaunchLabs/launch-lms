'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { programsApi } from '@services/programs/programs'
import { EmptyState, PageLoader } from './shared'

/** Old assignment links open where the assignment lives now: its group's Plans tab, or the learner. */
export default function AssignmentRedirect({ orgslug, assignmentUuid }: { orgslug: string; assignmentUuid: string }) {
  const router = useRouter()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const { data, isLoading } = useSWR(orgId && token ? ['assignment-summaries', orgId] : null, () => programsApi.assignments(orgId, token), { revalidateOnFocus: false })
  const assignment = (data || []).find((item: any) => item.assignment_uuid === assignmentUuid)
  const target = assignment
    ? assignment.cohort ? routePaths.org.dash.users.groupPlans(assignment.cohort.id, assignment.assignment_uuid)
      : assignment.user?.username ? routePaths.org.dash.users.userPage(assignment.user.username, 'plans')
        : assignment.plan_uuid ? routePaths.org.dash.livePlan(assignment.plan_uuid) : routePaths.org.dash.plans()
    : null
  React.useEffect(() => { if (target) router.replace(getUriWithOrg(orgslug, target)) }, [orgslug, router, target])
  if (isLoading || target) return <PageLoader />
  return <div className="p-10"><EmptyState title="Assignment not found" detail="It may have been deleted, or you are not on its team." /></div>
}
