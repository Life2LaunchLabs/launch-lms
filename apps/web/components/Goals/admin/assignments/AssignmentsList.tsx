'use client'

import React from 'react'
import useSWR from 'swr'
import { Loader2, Plus, Users } from 'lucide-react'
import { Button } from '@components/ui/button'
import FilterBar from '@components/Admin/Filters/FilterBar'
import { useFilters } from '@components/Admin/Filters/useFilters'
import GoalAssignmentModal from '@components/Goals/admin/templates/GoalAssignmentModal'
import { goalAdminApi, inboxKey, plansKey, type Cohort, type Inbox } from '@services/goals/admin'
import PageWelcome from '@components/Admin/PageWelcome'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { EmptyState } from '../live/ui'
import AssignmentActions from './AssignmentActions'
import AssignmentVersionBanner from '@components/Goals/admin/versions/AssignmentVersionBanner'
import { AssignmentListRow } from './AssignmentListRow'
import PlanCard from './PlanCard'
import { planFilterSpecs, shownPlans, stackSummary } from './planStack'
import { useStaff, useTemplateAssignments, type AssignmentRow } from './shared'

export { AssignmentListRow }

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
        actions={admin ? <AssignmentActions compact assignment={assignment} orgId={orgId} token={token} onChanged={onChanged} /> : null}
        banner={admin ? <AssignmentVersionBanner orgId={orgId} token={token} assignment={assignment as unknown as React.ComponentProps<typeof AssignmentVersionBanner>['assignment']} compact className="mt-2" onApplied={async () => { await onChanged() }} /> : null} />)}
    </ul>
  </section>
  return <div className="space-y-8">
    {assign ? <div className="flex justify-end">{assign}</div> : null}
    {current.length ? section('Current', current) : <EmptyState icon={<Users size={34} />} title="No assignments" detail={empty} />}
    {past.length ? section('Past', past) : null}
  </div>
}

/**
 * Plans › Assignments: one card per plan the viewer runs (all of the org's for admins, the ones they staff
 * for everyone else), each with its assignments here, under the tab's search and filters. Admins assign
 * from each plan's card; there's no general Assign button.
 */
export function OrgAssignments({ orgslug }: { orgslug: string }) {
  const { orgId, token, admin } = useStaff()
  const { data, error, isLoading, mutate } = useSWR(orgId && token ? plansKey(orgId) : null, () => goalAdminApi.plans(orgId, token))
  const needs = useNeeds(orgId, token)
  const specs = React.useMemo(() => planFilterSpecs(data, { admin }), [data, admin])
  const filters = useFilters(specs)
  const shown = React.useMemo(() => shownPlans(data, filters.values, { admin }), [data, filters.values, admin])
  const creator = admin && Boolean(data?.plans.some((plan) => plan.authorized_orgs.length))
  const summary = data ? [stackSummary(shown), admin ? '' : 'Showing plans you help run', creator ? 'Your own runs, plus orgs you authorized to run each plan' : ''].filter(Boolean).join(' · ') : null
  const refresh = () => mutate()
  const clear = () => { filters.clearAll(); filters.setQuery('') }

  let body: React.ReactNode
  if (isLoading || (!data && !error)) body = <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
  else if (error || !data) body = <EmptyState icon={<Users size={34} />} title="Plans unavailable" detail={error?.message || 'Try again in a moment.'} />
  else if (!data.plans.length) body = admin ? <PageWelcome icon={<Users size={28} />} title="Assignments: every plan you've handed out"
    body="Each plan you hand to a learner or a group shows up here, with who's moving, who's stuck and what's waiting on you to review."
    how="Hand out a plan from one of your templates. You choose when each stage opens, and learners see it in their feed."
    actions={[{ label: 'Hand out a plan', href: getUriWithOrg(orgslug, routePaths.org.admin.templates()), primary: true }, { label: 'Find a plan', href: getUriWithOrg(orgslug, routePaths.org.admin.marketplace()) }]} />
    : <EmptyState icon={<Users size={34} />} title="No plans yet" detail="Nothing you staff yet." />
  else if (!shown.cards.length) body = <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
    No plans match these filters. <button type="button" onClick={clear} className="font-bold text-violet-700 underline underline-offset-2">Clear filters</button>
  </div>
  else body = <div className="space-y-5">{shown.cards.map((card) => <PlanCard key={card.plan.template.template_uuid} {...card} orgslug={orgslug} orgId={orgId} token={token}
    admin={admin} needs={needs} onChanged={refresh} onShowEnded={() => filters.set('status', 'all')} />)}</div>

  return <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-5xl space-y-5">
    <FilterBar filters={filters} placeholder="Search plans, badges, requirements or people" summary={summary} />
    {body}
  </div></div>
}

/** One template's assignments, ended ones under Past, on the template's Assignments tab. */
export function TemplateAssignments({ orgslug, templateUuid, assign }: { orgslug: string; templateUuid: string; /** Hand the template out, at the top of the list. */ assign?: React.ReactNode }) {
  const { orgId, token } = useStaff()
  const { data = [], isLoading, mutate } = useTemplateAssignments(orgId, templateUuid, token)
  const needs = useNeeds(orgId, token)
  return <div className="px-4 pb-10 pt-6 sm:px-10"><div className="mx-auto max-w-5xl">
    <AssignmentsList rows={data} loading={isLoading} orgslug={orgslug} needs={needs} showTemplate={false} onChanged={() => mutate()} assign={assign} empty="Not handed out yet. Use Assign to give it to a group or a learner." />
  </div></div>
}

/** A group's assignments on its Plans tab: current ones, then past ones; admins hand it another. */
export function GroupAssignments({ orgslug, groupId, cohort, refresh }: { orgslug: string; groupId: number; cohort: Cohort; refresh: () => unknown }) {
  const { orgId, token, admin } = useStaff()
  const needs = useNeeds(orgId, token)
  const rows = [...cohort.assignments, ...cohort.completed_assignments]
  return <div className="px-4 pb-10 sm:px-10"><div className="mx-auto max-w-5xl">
    <AssignmentsList rows={rows} orgslug={orgslug} needs={needs} showTemplate onChanged={refresh}
      empty="No plan templates are assigned to this group yet."
      assign={admin ? <GoalAssignmentModal initialGroupIds={[groupId]} onAssigned={() => void refresh()} trigger={<Button type="button" size="sm"><Plus size={14} />Assign a template</Button>} /> : null} />
  </div></div>
}
