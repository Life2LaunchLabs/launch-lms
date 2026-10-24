'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Award, ChevronRight, Hand, Loader2, Plus, Route, Search, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import PageWelcome from '@components/Admin/PageWelcome'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import AssignFlow from '@components/Assignments/assign/AssignFlow'
import { Segmented } from '@components/Assignments/assign/flowUi'
import StatusBar, { StatusLegend } from '@components/Assignments/StatusBar'
import { NeedsButton } from '@components/Assignments/Needs'
import { PlanTile, TargetTile } from '@components/Assignments/Pair'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { assignmentApi, assignmentKeys, type AssignmentListItem, type AssignmentPlan } from '@services/assignments/assignments'
import { byPlan, filterRows, rowDates, rowSubtitle } from '@services/assignments/list'
import { plural } from '@services/assignments/status'
import { templateKeys, templatesApi } from '@services/goals/templates'

/**
 * Plans › Assignments: every assignment the viewer runs, under its plan. Each row says who, where
 * their learners are on one bar, its dates, and what needs the viewer; the row opens the assignment.
 */
export default function AssignmentsList({ orgslug }: { orgslug: string }) {
  const { orgId, token, admin } = useStaff()
  const ready = Boolean(orgId && token)
  const { data, error, mutate } = useSWR(ready ? assignmentKeys.list(orgId) : null, () => assignmentApi.list(orgId, token))
  const { data: templates } = useSWR(ready && admin ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId, token))
  if (error) return <Quiet title="Assignments unavailable" detail={error.message || 'Try again in a moment.'} />
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
  if (!data.length) return admin ? <PageWelcome icon={<Users size={28} />} title="Assignments: every plan you've handed out"
    body="Each plan you hand to a learner or a group shows up here, with who's moving, who's stuck and what's waiting on you."
    how="Assign a plan from its page. You choose when each stage opens, and learners see it in their feed."
    actions={[{ label: 'Assign a plan', href: getUriWithOrg(orgslug, routePaths.org.admin.plans()), primary: true }, { label: 'Find a plan', href: getUriWithOrg(orgslug, routePaths.org.admin.discover()) }]} />
    : <Quiet title="Nothing to run yet" detail="Assignments you're staff on show up here." />

  const assigned = new Set(data.map((item) => item.plan.template_uuid))
  const quiet = (templates || []).filter((plan) => !plan.system_type && plan.status === 'active' && plan.published_version && !assigned.has(plan.template_uuid)).length
  return <ListView items={data} orgslug={orgslug} quiet={quiet} renderAssign={admin ? (plan) => <AssignFlow initialTemplateUuid={plan.template_uuid} onAssigned={() => void mutate()}
    trigger={<button type="button" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-ink hover:underline"><Plus size={15} aria-hidden="true" />Assign</button>} /> : undefined} />
}

/** The list itself: its search and filters, then each plan's rows. */
export function ListView({ items: data, orgslug, quiet, renderAssign }: {
  items: AssignmentListItem[]
  orgslug: string
  /** Plans with a live version nobody has been assigned yet. */
  quiet: number
  /** Assign this plan, for those who can. */
  renderAssign?: (plan: AssignmentPlan) => React.ReactNode // eslint-disable-line no-unused-vars
}) {
  const [query, setQuery] = React.useState('')
  const [ended, setEnded] = React.useState(false)
  const [needsMe, setNeedsMe] = React.useState(false)
  const running = data.filter((item) => item.status !== 'ended').length
  const groups = byPlan(filterRows(data, { query, ended, needsMe }))
  const open = (item: AssignmentListItem, extra = '') => getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(item.assignment_uuid)) + extra

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="flex h-10 w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm sm:w-[260px]">
        <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, groups or plans" aria-label="Search assignments"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
      </label>
      <Segmented label="Show" value={ended ? 'ended' : 'running'} onChange={(value) => setEnded(value === 'ended')}
        options={[{ value: 'running', label: `Running · ${running}` }, { value: 'ended', label: `Ended · ${data.length - running}` }]} />
      <span className="flex-1" />
      <button type="button" aria-pressed={needsMe} onClick={() => setNeedsMe(!needsMe)}
        className={cn('inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
          needsMe ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted')}>
        <Hand size={16} aria-hidden="true" />Needs me
      </button>
    </div>
    <StatusLegend />
    {groups.length ? groups.map(({ plan, rows }) => <section key={plan.template_uuid} aria-label={plan.title} className="space-y-2.5">
      <PlanHead plan={plan} orgslug={orgslug} assign={ended ? null : renderAssign?.(plan)} />
      <ul className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        {rows.map((item) => <Row key={item.assignment_uuid} item={item} href={open(item)} needsHref={open(item, '?tab=people&needs=1')} />)}
      </ul>
    </section>) : <Quiet title={needsMe ? 'Nothing needs you' : ended ? 'Nothing has ended' : 'No assignments match'}
      detail={needsMe ? 'No questions, nothing to review, no one past due.' : ended ? 'Ended assignments show up here.' : 'Try another name or plan.'} />}
    {!ended && quiet ? <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Route size={16} aria-hidden="true" />
      <span>{plural(quiet, 'other plan')} {quiet === 1 ? 'hasn’t' : 'haven’t'} been handed out yet. Assign one from its page in <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans())} className="font-semibold text-brand-ink hover:underline">Plans</Link>.</span>
    </p> : null}
  </div>
}

function PlanHead({ plan, orgslug, assign }: { plan: AssignmentPlan; orgslug: string; assign: React.ReactNode }) {
  return <div className="flex items-center gap-2.5 px-1">
    <PlanTile plan={plan} size="sm" />
    <Link href={getUriWithOrg(orgslug, routePaths.org.admin.template(plan.template_uuid))} className="min-w-0 truncate text-[17px] font-bold hover:underline">{plan.title}</Link>
    {plan.version ? <span className="text-[13px] text-muted-foreground">v{plan.version}</span> : null}
    {plan.badge ? <span title={`Earns ${plan.badge.name}`} className="text-amber-500"><Award size={16} aria-label={`Earns ${plan.badge.name}`} /></span> : null}
    <span className="flex-1" />
    {assign}
  </div>
}

function Row({ item, href, needsHref }: { item: AssignmentListItem; href: string; needsHref: string }) {
  const [start, end] = rowDates(item)
  const done = item.status === 'ended'
  return <li className={cn('relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3.5 last:border-b-0 hover:bg-muted/40',
    'md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_150px_20px]', done && 'opacity-80')}>
    <div className="flex min-w-0 items-center gap-3">
      <TargetTile target={item.target} />
      <span className="min-w-0">
        <Link href={href} className="block truncate text-[15px] font-semibold after:absolute after:inset-0 focus-visible:outline-none">{item.target.name || 'Invitation'}</Link>
        <span className="block truncate text-[13px] text-muted-foreground">{rowSubtitle(item)}</span>
      </span>
    </div>
    <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
      <StatusBar counts={item.counts} unit={item.learner_count > 1 ? 'steps across the group' : 'steps'} now={!done} label={`${item.target.name} on ${item.plan.title}`} className="relative z-10" />
      <span className="mt-1.5 flex justify-between text-xs text-muted-foreground"><span>{start}</span><span>{end}</span></span>
    </div>
    <span className="relative z-10 col-start-2 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
      {done ? null : <NeedsButton needs={item.needs} href={needsHref} />}
    </span>
    <ChevronRight size={18} className="hidden text-muted-foreground md:block" aria-hidden="true" />
  </li>
}

function Quiet({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
    <h2 className="text-base font-bold">{title}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
  </div>
}
