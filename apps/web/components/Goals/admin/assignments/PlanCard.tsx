'use client'

import React from 'react'
import Link from 'next/link'
import { Buildings, CaretRight, Info, ListBullets, Medal, StackSimple } from '@phosphor-icons/react'
import GoalAssignmentModal from '@components/Plans/editor/GoalAssignmentModal'
import AssignmentVersionBanner from '@components/Goals/admin/versions/AssignmentVersionBanner'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { cn } from '@/lib/utils'
import AssignmentActions from './AssignmentActions'
import { AssignmentListRow, PLAN_ROW_GRID } from './AssignmentListRow'
import type { Needs } from './AssignmentsList'
import type { ShownPlan } from './planStack'

type Props = ShownPlan & {
  orgslug: string
  orgId: number
  token?: string
  /** Admins assign, and run each assignment from its menu. */
  admin: boolean
  needs: Needs
  onChanged: () => unknown
  /** "Show them": switch the status filter to show ended assignments too. */
  onShowEnded: () => void
}

const button = 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium hover:bg-muted'
const chip = 'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold'

/** "3 stages · 9 steps", plus where it comes from when another organization made it. */
export function planMeta(plan: ShownPlan['plan']) {
  const { template } = plan
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  const owner = template.owner_org?.name || 'another organization'
  const source = template.own ? null : template.run_with_permission ? `From ${owner} · you run it with their permission` : `From ${owner}`
  return [plural(template.stage_count, 'stage'), plural(template.step_count, 'step'), source].filter(Boolean).join(' · ')
}

function monthYear(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

/**
 * One plan on the Assignments tab: the template (version, size, where it comes from), the badge it earns and
 * the requirements it counts toward, Assign and Open plan, then its assignments here. On the org's own plans,
 * admins also see the other organizations running it, as counts.
 */
export default function PlanCard({ plan, rows, partners, endedHidden, total, onlyPartners, orgslug, orgId, token, admin, needs, onChanged, onShowEnded }: Props) {
  const { template } = plan
  const templateHref = getUriWithOrg(orgslug, routePaths.org.admin.template(template.template_uuid))
  const assign = (label: string, primary = false) => admin && template.version ? <GoalAssignmentModal initialTemplateUuid={template.template_uuid} onAssigned={async () => { await onChanged() }}
    trigger={<button type="button" className={primary ? 'inline-flex h-9 items-center rounded-full bg-black px-3.5 text-sm font-medium text-white hover:bg-black/85' : button}>{label}</button>} /> : null
  return <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs" aria-label={template.title}>
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
      <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><StackSimple size={22} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 text-lg font-black leading-tight"><Link href={templateHref} className="hover:underline">{template.title}</Link></h2>
            {template.version ? <span className="rounded-md bg-green-50 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-green-700">v{template.version} live</span>
              : <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-gray-600">Not released</span>}
            {template.status === 'archived' ? <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-gray-600">Archived</span> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{planMeta(plan)}</p>
          {plan.badges.length || plan.frameworks.length ? <div className="mt-3 flex flex-wrap gap-2" aria-label="Badge and requirements">
            {plan.badges.map((badge) => <Link key={badge.badge_uuid} href={getUriWithOrg(orgslug, routePaths.org.admin.badge(badge.badge_uuid, 'definition'))}
              className={cn(chip, 'bg-amber-50 text-amber-800 hover:bg-amber-100')}><Medal size={14} aria-hidden="true" /><span className="truncate">Earns {badge.name}</span></Link>)}
            {plan.frameworks.map((framework) => {
              const label = <><ListBullets size={14} aria-hidden="true" /><span className="truncate">{framework.name} · {framework.node_count}</span></>
              const title = `${framework.node_count} requirement${framework.node_count === 1 ? '' : 's'} of ${framework.name}`
              // Another organization's framework has no page here.
              return framework.org_id === orgId
                ? <Link key={framework.framework_uuid} href={getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(framework.framework_uuid, 'details'))} title={title} className={cn(chip, 'bg-violet-50 text-violet-800 hover:bg-violet-100')}>{label}</Link>
                : <span key={framework.framework_uuid} title={title} className={cn(chip, 'bg-violet-50 text-violet-800')}>{label}</span>
            })}
          </div> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 pl-14 sm:pl-0">
        {assign('Assign')}
        <Link href={templateHref} className={button}>Open plan<CaretRight size={14} aria-hidden="true" /></Link>
      </div>
    </div>

    {rows.length ? <>
      <div className={cn('hidden border-y border-border bg-muted/40 px-5 py-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground', PLAN_ROW_GRID)} aria-hidden="true">
        <span>Assigned to</span><span>Dates</span><span>Staff</span><span>Progress</span><span>Needs you</span><span className="w-4" />
      </div>
      <ul className="divide-y divide-border border-t border-border md:border-t-0" aria-label={`Assignments of ${template.title}`}>
        {rows.map((assignment) => <AssignmentListRow key={assignment.assignment_uuid} layout="table" assignment={assignment} orgslug={orgslug} showTemplate={false}
          need={needs[assignment.assignment_uuid]}
          actions={admin ? <AssignmentActions compact assignment={assignment} orgId={orgId} token={token} onChanged={onChanged} /> : null}
          banner={admin ? <AssignmentVersionBanner orgId={orgId} token={token} assignment={assignment} compact className="mt-2" onApplied={async () => { await onChanged() }} /> : null} />)}
      </ul>
    </> : onlyPartners ? null : <div className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
      <Info size={16} aria-hidden="true" /><span className="min-w-0 flex-1">{total ? 'No current assignments of your own.' : 'Not assigned yet.'}</span>
      {assign('Assign to a group or person', true)}
    </div>}

    {partners.length ? <section aria-label="Run by authorized orgs">
      <h3 className="border-y border-border bg-muted/40 px-5 py-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">Run by authorized orgs · {partners.length}</h3>
      <ul className="divide-y divide-border">
        {partners.map((item) => <li key={item.org?.id ?? item.since} className={cn('flex flex-col gap-1.5 px-4 py-3 sm:px-5', PLAN_ROW_GRID)}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Buildings size={16} aria-hidden="true" /></span>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{item.org?.name || 'An organization'}</p>
              <p className="text-xs text-muted-foreground">Authorized · {item.learner_count} learner{item.learner_count === 1 ? '' : 's'}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-11 md:contents">
            <span className="text-xs text-muted-foreground md:text-sm">{monthYear(item.since) ? `Since ${monthYear(item.since)}` : ''}</span>
            <span className="hidden md:block" />
            <span className="text-xs text-muted-foreground">Their staff run it</span>
          </div>
        </li>)}
      </ul>
    </section> : null}

    {endedHidden ? <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
      {endedHidden} ended assignment{endedHidden === 1 ? '' : 's'} hidden.{' '}
      <button type="button" onClick={onShowEnded} className="font-bold text-violet-700 underline underline-offset-2 hover:text-violet-900">Show them</button>
    </p> : null}
  </article>
}
