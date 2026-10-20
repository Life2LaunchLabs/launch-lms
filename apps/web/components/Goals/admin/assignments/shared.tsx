'use client'

import React from 'react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import { routePaths } from '@services/config/config'
import type { AssignmentStatus, AssignmentSummary } from '@services/goals/admin'
import { templateKeys, templatesApi, type GoalAssignmentSummary } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { personName } from '../live/ui'

/** What every assignment row needs, from either list the API serves (the org's, or one template's). */
export type AssignmentRow = Pick<AssignmentSummary, 'assignment_uuid' | 'template_uuid' | 'template_title' | 'version' | 'cohort' | 'user' | 'subject_email'
  | 'learner_count' | 'status' | 'start_date' | 'due_date' | 'assignment_type' | 'staff'>

/** Who the assignment is for: its group, or the one learner. */
export function assignmentLabel(assignment: Pick<AssignmentRow, 'cohort' | 'user' | 'subject_email'>) {
  return assignment.cohort?.name || (assignment.user ? personName(assignment.user) : '') || assignment.subject_email || 'Learner'
}

export const assignmentHref = (assignment: Pick<AssignmentRow, 'assignment_uuid'>) => routePaths.org.admin.planAssignment(assignment.assignment_uuid)

/** A template's assignments, ended ones too, shared by its overview and its Assignments tab. */
export function useTemplateAssignments(orgId: number, templateUuid: string, token?: string) {
  return useSWR<GoalAssignmentSummary[]>(orgId && token ? templateKeys.assignments(orgId, templateUuid) : null, () => templatesApi.assignments(orgId, templateUuid, token))
}

/** The signed-in staff member: their token and org, and whether they run the organization (pause, end and re-date assignments). */
export function useStaff() {
  const session = useLHSession() as { data?: { tokens?: { access_token?: string }; user?: { id?: number } } }
  const org = useOrg() as { id?: number } | null
  const { rights } = useAdminStatus()
  return {
    token: session?.data?.tokens?.access_token,
    orgId: Number(org?.id),
    viewerId: session?.data?.user?.id,
    admin: rights?.organizations?.action_update === true,
  }
}

export function shortDay(value?: string | null) {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

/** An assignment's dates as one line: Sep 8 – Jan 4, From Sep 8, Until Jan 4, or Self-paced. */
export function datesLine(assignment: Pick<AssignmentRow, 'start_date' | 'due_date'>) {
  if (assignment.start_date && assignment.due_date) return `${shortDay(assignment.start_date)} – ${shortDay(assignment.due_date)}`
  if (assignment.start_date) return `From ${shortDay(assignment.start_date)}`
  return assignment.due_date ? `Until ${shortDay(assignment.due_date)}` : 'Self-paced'
}

const STATUS: Record<AssignmentStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-green-50 text-green-700' },
  paused: { label: 'Paused', cls: 'bg-amber-50 text-amber-800' },
  ended: { label: 'Ended', cls: 'bg-gray-100 text-gray-600' },
}

export function StatusChip({ status, className }: { status: AssignmentStatus; className?: string }) {
  const look = STATUS[status] || STATUS.active
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase', look.cls, className)}>{look.label}</span>
}

/** A small rounded chip, for counts and states on a row. */
export function Chip({ tone = 'gray', children, className }: { tone?: 'gray' | 'blue' | 'green' | 'amber' | 'red'; children: React.ReactNode; className?: string }) {
  const tones = { gray: 'bg-gray-100 text-gray-700', blue: 'bg-blue-50 text-blue-700', green: 'bg-green-50 text-green-700', amber: 'bg-amber-50 text-amber-800', red: 'bg-red-50 text-red-700' }
  return <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold', tones[tone], className)}>{children}</span>
}
