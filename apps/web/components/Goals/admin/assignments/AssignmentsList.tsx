'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronRight, Loader2, Mail, Plus, User, Users } from 'lucide-react'
import { Button } from '@components/ui/button'
import GoalAssignmentModal from '@components/Goals/admin/templates/GoalAssignmentModal'
import { getUriWithOrg } from '@services/config/config'
import { assignmentsKey, goalAdminApi, inboxKey, type Cohort, type Inbox } from '@services/goals/admin'
import { EmptyState } from '../live/ui'
import AssignmentActions from './AssignmentActions'
import { assignmentHref, assignmentLabel, Chip, datesLine, StatusChip, useStaff, useTemplateAssignments, type AssignmentRow } from './shared'

/** What waits on the viewer in each assignment, from their review inbox: hand-ins to grade, staff steps to settle. */
export type Needs = Record<string, { grade: number; settle: number }>

export function needsOf(inbox?: Inbox): Needs {
  const needs: Needs = {}
  for (const group of inbox?.groups || []) {
    if (!group.assignment_uuid || group.kind === 'nudge') continue
    const entry = needs[group.assignment_uuid] ||= { grade: 0, settle: 0 }
    if (group.kind === 'confirm') entry.settle += group.count
    else entry.grade += group.count
  }
  return needs
}

/** The viewer's inbox as counts per assignment. */
export function useNeeds(orgId: number, token?: string) {
  const { data } = useSWR(orgId && token ? inboxKey(orgId) : null, () => goalAdminApi.inbox(orgId, token), { revalidateOnFocus: false })
  return React.useMemo(() => needsOf(data), [data])
}

/**
 * Assignments, one row per template handed to a group or a person: two cohorts on the same
 * template are two rows. Each says where it stands, its dates, how many learners, and what
 * waits on staff; admins run it from its menu. Ended ones sit under Past.
 */
export default function AssignmentsList({ rows, loading, orgslug, needs = {}, onChanged, showTemplate = true, empty, assign }: {
  rows: AssignmentRow[]
  loading?: boolean
  orgslug: string
  needs?: Needs
  onChanged: () => unknown
  /** One template's list leaves its title out. */
  showTemplate?: boolean
  empty: string
  /** Where admins hand out another one. */
  assign?: React.ReactNode
}) {
  const { orgId, token, admin } = useStaff()
  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const current = rows.filter((item) => item.status !== 'ended')
  const past = rows.filter((item) => item.status === 'ended')
  const section = (title: string, items: AssignmentRow[]) => <section aria-label={title}>
    <h2 className="mb-2 border-b border-border pb-2 text-sm font-black uppercase tracking-wider text-muted-foreground">{title}</h2>
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {items.map((assignment) => <AssignmentListRow key={assignment.assignment_uuid} assignment={assignment} orgslug={orgslug} showTemplate={showTemplate} need={needs[assignment.assignment_uuid]}
        actions={admin ? <AssignmentActions compact assignment={assignment} orgId={orgId} token={token} onChanged={onChanged} /> : null} />)}
    </ul>
  </section>
  return <div className="space-y-8">
    {assign ? <div className="flex justify-end">{assign}</div> : null}
    {current.length ? section('Current', current) : <EmptyState icon={<Users size={34} />} title="No assignments" detail={empty} />}
    {past.length ? section('Past', past) : null}
  </div>
}

function AssignmentListRow({ assignment, orgslug, showTemplate, need, actions }: { assignment: AssignmentRow; orgslug: string; showTemplate: boolean; need?: { grade: number; settle: number }; actions: React.ReactNode }) {
  const Icon = assignment.assignment_type === 'group' ? Users : assignment.assignment_type === 'external' ? Mail : User
  const who = assignmentLabel(assignment)
  return <li className="relative flex items-center gap-3 p-4 transition hover:bg-muted/50">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon size={18} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={getUriWithOrg(orgslug, assignmentHref(assignment))} className="truncate text-sm font-black after:absolute after:inset-0 focus-visible:outline-none">
          {showTemplate ? `${assignment.template_title} · ${who}` : who}
        </Link>
        <StatusChip status={assignment.status} />
        {assignment.version ? <span className="text-[11px] font-semibold text-muted-foreground">v{assignment.version}</span> : null}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{assignment.learner_count} learner{assignment.learner_count === 1 ? '' : 's'}{assignment.assignment_type === 'group' ? ' · people who join the group get it too' : ''}</span>
        <span>{datesLine(assignment)}</span>
        {assignment.staff.length ? <span>Staff: {assignment.staff.map((person) => [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username).join(', ')}</span> : null}
      </p>
    </div>
    <span className="flex shrink-0 flex-wrap justify-end gap-1.5" aria-label="Waiting on you">
      {need?.grade ? <Chip tone="blue">{need.grade} to grade</Chip> : null}
      {need?.settle ? <Chip tone="amber">{need.settle} to settle</Chip> : null}
    </span>
    {actions ? <span className="relative z-10 shrink-0">{actions}</span> : null}
    <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
  </li>
}

/** Every assignment the viewer runs: all of them for admins, the ones they staff for everyone else. */
export function OrgAssignments({ orgslug }: { orgslug: string }) {
  const { orgId, token, admin } = useStaff()
  const { data = [], isLoading, mutate } = useSWR(orgId && token ? assignmentsKey(orgId) : null, () => goalAdminApi.assignments(orgId, token))
  const needs = useNeeds(orgId, token)
  return <div className="px-6 pb-10 pt-6 lg:px-10"><div className="mx-auto max-w-5xl">
    <p className="mb-6 text-sm text-muted-foreground">{admin ? 'Every plan template your organization has handed out, one row per group or person.' : 'The plan templates you help run, one row per group or person.'}</p>
    <AssignmentsList rows={data} loading={isLoading} orgslug={orgslug} needs={needs} onChanged={() => mutate()}
      empty={admin ? 'Assign a plan template to a group or a learner to see it here.' : 'Nothing you staff yet.'}
      assign={admin ? <GoalAssignmentModal onAssigned={() => void mutate()} trigger={<Button type="button" size="sm"><Plus size={14} />Assign a template</Button>} /> : null} />
  </div></div>
}

/** One template's assignments, ended ones under Past, on the template's Assignments tab. */
export function TemplateAssignments({ orgslug, templateUuid }: { orgslug: string; templateUuid: string }) {
  const { orgId, token } = useStaff()
  const { data = [], isLoading, mutate } = useTemplateAssignments(orgId, templateUuid, token)
  const needs = useNeeds(orgId, token)
  return <div className="px-10 pb-10 pt-6"><div className="mx-auto max-w-5xl">
    <AssignmentsList rows={data} loading={isLoading} orgslug={orgslug} needs={needs} showTemplate={false} onChanged={() => mutate()} empty="Not handed out yet. Use Assign to give it to a group or a learner." />
  </div></div>
}

/** A group's assignments on its Plans tab: current ones, then past ones; admins hand it another. */
export function GroupAssignments({ orgslug, groupId, cohort, refresh }: { orgslug: string; groupId: number; cohort: Cohort; refresh: () => unknown }) {
  const { orgId, token, admin } = useStaff()
  const needs = useNeeds(orgId, token)
  const rows = [...cohort.assignments, ...cohort.completed_assignments]
  return <div className="px-10 pb-10"><div className="mx-auto max-w-5xl">
    <AssignmentsList rows={rows} orgslug={orgslug} needs={needs} showTemplate onChanged={refresh}
      empty="No plan templates are assigned to this group yet."
      assign={admin ? <GoalAssignmentModal initialGroupIds={[groupId]} onAssigned={() => void refresh()} trigger={<Button type="button" size="sm"><Plus size={14} />Assign a template</Button>} /> : null} />
  </div></div>
}
