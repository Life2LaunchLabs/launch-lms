'use client'

import React from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight, Mail, User, Users } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { GoalAssignmentSummary } from '@services/goals/templates'
import AssignmentVersionBanner from './AssignmentVersionBanner'

const assignmentLabel = (assignment: GoalAssignmentSummary) => {
  const user = assignment.user
  return assignment.cohort?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || assignment.subject_email || 'Learner'
}

const formatDate = (value?: string | null) => { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString() }

/** Assignments as rows; each says when its template has a newer version or its badge no longer accepts its version. */
export function AssignmentSection({ title, assignments, orgslug, orgId, token }: { title: string; assignments: GoalAssignmentSummary[]; orgslug: string; orgId: number; token?: string }) {
  return <section>
    <div className="mb-2 border-b border-border pb-2"><h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">{title}</h2></div>
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {assignments.map((assignment) => {
        const Icon = assignment.assignment_type === 'group' ? Users : assignment.assignment_type === 'external' ? Mail : User
        return <div key={assignment.assignment_uuid}><Link href={getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(assignment.assignment_uuid))} className="flex items-center gap-3 p-4 transition hover:bg-muted/50">
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
