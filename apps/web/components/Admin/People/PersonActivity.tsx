'use client'

import React from 'react'
import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { chatTime } from '@components/Connect/ConnectView'
import type { TimelineItem } from '@components/Connect/workspace/ChatWorkspace'
import { reviewHref } from '@components/Goals/admin/live/ui'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { PersonActivity, TurnIn } from '@services/school/people'
import HelperRequestCard from './HelperRequests'
import { usePeopleContext, usePersonActivity, useRefreshPeople } from './usePeople'

/**
 * What waits on you about someone, as cards for their conversation: helpers to approve (admins
 * decide inline) and steps they turned in (opened in the review workspace, not graded here).
 */
export function usePersonTimeline(orgslug: string, username: string, firstName?: string) {
  const { isAdmin } = usePeopleContext()
  const { data, mutate } = usePersonActivity(username)
  const refreshList = useRefreshPeople()
  const items = React.useMemo(() => timelineItems(data, orgslug, firstName, async () => { await Promise.all([mutate(), refreshList()]) }, isAdmin),
    [data, orgslug, firstName, mutate, refreshList, isAdmin])
  return { items, activity: data }
}

function timelineItems(data: PersonActivity | undefined, orgslug: string, firstName: string | undefined, refresh: () => Promise<unknown>, isAdmin: boolean): TimelineItem[] {
  if (!data) return []
  return [
    ...data.approvals.map((request) => ({ key: `approval-${request.invitation_uuid}`, at: request.creation_date,
      node: <HelperRequestCard request={request} canDecide={data.can_approve || isAdmin} onDecided={refresh} /> })),
    ...data.turn_ins.map((item) => ({ key: `turn-in-${item.step_uuid}`, at: item.submitted_at, node: <TurnInCard item={item} orgslug={orgslug} firstName={firstName} /> })),
  ]
}

/** A step someone turned in that waits on your review, with the way into the review workspace. */
export function TurnInCard({ item, orgslug, firstName }: { item: TurnIn; orgslug: string; firstName?: string }) {
  const href = item.assignment_uuid
    ? reviewHref({ assignment: item.assignment_uuid, stepKey: item.step_key, stepUuid: item.step_key ? null : item.step_uuid, focus: item.step_uuid })
    : routePaths.org.admin.learnerFeed(item.goal_uuid)
  return <article aria-label={`Turned in: ${item.step_title}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><ClipboardCheck size={16} /></span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold">{firstName || 'They'} turned in &ldquo;{item.step_title}&rdquo;</p>
      <p className="truncate text-xs text-muted-foreground">{item.plan_title} · {chatTime(item.submitted_at)}</p>
    </div>
    <Link href={getUriWithOrg(orgslug, href)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-xs font-bold hover:bg-muted">
      <ClipboardCheck size={14} />Open to review
    </Link>
  </article>
}
