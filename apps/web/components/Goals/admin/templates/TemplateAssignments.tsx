'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { CalendarDays, ChevronRight, Loader2, Mail, User, Users } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { templateKeys, templatesApi, type GoalAssignmentSummary } from '@services/goals/templates'
import AssignmentVersionBanner from '@components/Goals/admin/versions/AssignmentVersionBanner'

/** Where an assignment is looked after now: its group's goals tab, the learner, or the one live goal. */
export function assignmentPath(assignment: GoalAssignmentSummary) {
  if (assignment.cohort) return routePaths.org.admin.people.groupPlans(assignment.cohort.id, assignment.assignment_uuid)
  if (assignment.user?.username) return routePaths.org.admin.people.userPage(assignment.user.username, 'plans')
  if (assignment.goal_uuid) return routePaths.org.admin.livePlan(assignment.goal_uuid)
  return routePaths.org.admin.assignments()
}

export function assignmentLabel(assignment: GoalAssignmentSummary) {
  const user = assignment.user
  return assignment.cohort?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || assignment.subject_email || 'Learner'
}

/** A template's assignments, loaded once and shared by the overview and the Handed out tab. */
export function useTemplateAssignments(orgId: number, templateUuid: string, token?: string) {
  return useSWR<GoalAssignmentSummary[]>(orgId && token ? templateKeys.assignments(orgId, templateUuid) : null, () => templatesApi.assignments(orgId, templateUuid, token))
}

const formatDate = (value?: string | null) => { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString() }

/** Everyone the template was handed to, active first. */
export default function TemplateAssignments({ orgslug, orgId, token, templateUuid }: { orgslug: string; orgId: number; token?: string; templateUuid: string }) {
  const { data: assignments = [], isLoading } = useTemplateAssignments(orgId, templateUuid, token)
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const active = assignments.filter((item) => item.status !== 'ended')
  const past = assignments.filter((item) => item.status === 'ended')
  return <div className="px-10 pb-10 pt-6"><div className="mx-auto max-w-5xl">
    {active.length ? <AssignmentSection title="Active" assignments={active} orgslug={orgslug} orgId={orgId} token={token} /> : <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center"><Users className="mx-auto text-gray-300" size={34} /><p className="mt-3 text-sm font-semibold text-muted-foreground">Not handed out yet. Use Assign to give it to a group or a learner.</p></div>}
    {past.length ? <div className="mt-8"><AssignmentSection title="Past" assignments={past} orgslug={orgslug} orgId={orgId} token={token} /></div> : null}
  </div></div>
}

/** Assignments as rows; each says when its template has a newer version or its badge no longer accepts its version. */
export function AssignmentSection({ title, assignments, orgslug, orgId, token }: { title: string; assignments: GoalAssignmentSummary[]; orgslug: string; orgId: number; token?: string }) {
  return <section>
    <div className="mb-2 border-b border-border pb-2"><h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">{title}</h2></div>
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {assignments.map((assignment) => {
        const Icon = assignment.assignment_type === 'group' ? Users : assignment.assignment_type === 'external' ? Mail : User
        return <div key={assignment.assignment_uuid}><Link href={getUriWithOrg(orgslug, assignmentPath(assignment))} className="flex items-center gap-3 p-4 transition hover:bg-muted/50">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon size={18} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-black">{assignmentLabel(assignment)}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase text-muted-foreground">{assignment.assignment_type === 'group' ? 'Group' : assignment.assignment_type === 'external' ? 'By email' : 'Individual'}</span>
              {assignment.version ? <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase text-muted-foreground">v{assignment.version}</span> : null}
              <span className={assignment.status !== 'ended' ? 'rounded-full bg-green-50 px-2 py-0.5 text-[9px] font-black uppercase text-green-700' : 'rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black uppercase text-gray-600'}>{assignment.status === 'paused' ? 'Paused' : assignment.status === 'ended' ? 'Ended' : 'Active'}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{assignment.learner_count} learner{assignment.learner_count === 1 ? '' : 's'}</span>
              <span>{assignment.progress_percent}% done</span>
              {assignment.ready_for_review_count ? <span>{assignment.ready_for_review_count} to review</span> : null}
              {assignment.due_date ? <span className="inline-flex items-center gap-1"><CalendarDays size={12} />Due {formatDate(assignment.due_date)}</span> : null}
              <span>Assigned {formatDate(assignment.creation_date)}</span>
            </div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link><AssignmentVersionBanner orgId={orgId} token={token} assignment={assignment} compact className="mx-4 mb-3" /></div>
      })}
    </div>
  </section>
}
