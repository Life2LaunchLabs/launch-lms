'use client'
import React from 'react'
import Link from 'next/link'
import { ArrowRight, Check, X } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { AdminFirstSteps, FirstSteps as FirstStepsData, GettingStartedStepKey, StaffFirstSteps, StaffStepKey, TickableStep } from '@services/goals/adminHome'
import { cn } from '@/lib/utils'

const admin = routePaths.org.admin

type Space = 'Plans' | 'Organization' | 'Threads' | 'Assignments' | 'Insights' | 'Profile'
const SPACE_TONE: Record<Space, string> = {
  Plans: 'bg-orange-50 text-orange-700', Organization: 'bg-gray-100 text-gray-600', Threads: 'bg-violet-50 text-violet-700',
  Assignments: 'bg-blue-50 text-blue-700', Insights: 'bg-emerald-50 text-emerald-700', Profile: 'bg-gray-100 text-gray-600',
}

/** One line of the checklist, however it's opened. */
interface Row { key: string; title: string; detail: string; space: Space; action: string; done: boolean; optional?: boolean; note?: string | null; href?: string; onOpen?: () => void }

/** What each admin step says and where it sends them. The API decides which are done. */
const ADMIN_STEPS: Record<GettingStartedStepKey, { title: string; detail: string; action: string; space: Space; href: () => string }> = {
  plan: { title: 'Add plans to your library', detail: 'Start from Discover or build your own.', action: 'Browse', space: 'Plans', href: () => admin.discover() },
  organization: { title: 'Add your logo and details', detail: 'So people know who invited them.', action: 'Add', space: 'Organization', href: () => admin.organization.branding() },
  staff: { title: 'Add your staff', detail: 'Pick their permissions and assignments.', action: 'Invite', space: 'Threads', href: () => admin.people.root({ invite: 'staff' }) },
  groups: { title: 'Set up groups', detail: 'Cohorts, classes or teams.', action: 'Add', space: 'Threads', href: () => admin.people.root() },
  requirements: { title: 'Add requirements', detail: 'Link steps to what you report on.', action: 'Add', space: 'Plans', href: () => admin.requirements() },
  learners: { title: 'Bring in learners', detail: 'Send an email invite or share a join link.', action: 'Invite', space: 'Threads', href: () => admin.people.root({ invite: 'learner' }) },
  assign: { title: 'Hand out your first plan', detail: 'They get their own copy and start on step one.', action: 'Assign', space: 'Assignments', href: () => admin.plans() },
}

function adminRows(data: AdminFirstSteps, orgslug: string): Row[] {
  return data.steps.map((step) => ({ ...ADMIN_STEPS[step.key], key: step.key, done: step.done, optional: step.optional, note: step.note, href: getUriWithOrg(orgslug, ADMIN_STEPS[step.key].href()) }))
}

/** A staff member's steps, named after the first assignment they're on. Opening a step that data can't tick ticks it. */
function staffRows(data: StaffFirstSteps, orgslug: string, onTick: (step: TickableStep) => void, onBrief: () => void): Row[] { // eslint-disable-line no-unused-vars
  const focus = data.focus
  const target = focus?.target
  const threadOf = target?.type === 'group' ? admin.threads.group(target.id) : target?.type === 'person' && target.person ? admin.threads.person(target.person.id) : admin.threads.staff()
  const copy: Record<StaffStepKey, Omit<Row, 'key' | 'done'>> = {
    profile: { title: 'Set up your profile', detail: 'Your photo and name, beside your messages and reviews.', space: 'Profile', action: 'Edit', href: routePaths.org.account.root() },
    brief: { title: focus && focus.count > 1 ? `Look through your ${focus.count} assignments` : `Get to know ${target?.name || 'your assignment'}`,
      detail: 'Where they are, what’s next and how you work with them.', space: 'Assignments', action: 'Open', onOpen: () => { onBrief(); onTick('brief') } },
    try: { title: 'Try the step they’re on', detail: `See ${focus?.plan || 'the plan'} the way learners do.`, space: 'Plans', action: 'Try it',
      href: focus ? admin.template(focus.template_uuid) : admin.plans(), onOpen: () => onTick('try') },
    hello: { title: target?.type === 'group' ? `Say hello to ${target.name}` : 'Say hello to the team',
      detail: target?.type === 'group' ? 'Learners’ progress and questions land in their threads.' : 'Post in the Staff thread, where staff talk.', space: 'Threads', action: 'Write', href: threadOf },
    review: { title: 'Review a hand-in', detail: 'Hand-ins waiting on you show in Needs you, below.', space: 'Assignments', action: 'Review', href: admin.assignments() },
    plans: { title: 'Open a draft in Plans', detail: 'Your library, drafts and Discover live there.', space: 'Plans', action: 'Open', href: admin.plans(), onOpen: () => onTick('plans') },
    preview: { title: 'Try a plan as a learner', detail: 'Preview any step the way learners see it.', space: 'Plans', action: 'Preview', href: admin.plans(), onOpen: () => onTick('preview') },
    people: { title: 'Find your learners', detail: 'Profiles, groups and invites are in Threads.', space: 'Threads', action: 'Open', href: admin.threads.root(), onOpen: () => onTick('people') },
    insights: { title: 'Pin an insight to Home', detail: 'Open Insights and pin a card you want every day.', space: 'Insights', action: 'Open', href: admin.insights() },
  }
  return data.steps.map((step) => {
    const row = copy[step.key]
    return { ...row, key: step.key, done: step.done, href: row.href ? getUriWithOrg(orgslug, row.href) : undefined }
  })
}

/**
 * First steps, in the middle of Home until it's dismissed: an admin's org setup, or a staff member's lap of
 * the places they'll work. It ticks itself off from data, and steps data can't see tick when opened.
 */
export default function FirstSteps({ data, orgslug, onDismiss, onTick, onBrief }: {
  data: FirstStepsData
  orgslug: string
  onDismiss: () => void
  onTick: (step: TickableStep) => void // eslint-disable-line no-unused-vars
  onBrief: () => void
}) {
  const rows = data.kind === 'admin' ? adminRows(data, orgslug) : staffRows(data, orgslug, onTick, onBrief)
  const all = data.done === data.total || (data.kind === 'admin' && data.complete)
  const next = rows.find((row) => !row.done && !row.optional) || rows.find((row) => !row.done)
  const circumference = 2 * Math.PI * 21
  const sub = all ? 'All done. Dismiss this when you’re ready.' : data.kind === 'admin'
    ? data.from_setup ? 'Picked up from your setup. A few steps to your first learner on a plan.' : 'A few steps to your first learner on a plan.'
    : 'A quick lap of the places you’ll work. It ticks itself off as you go.'
  return (
    <section aria-labelledby="first-steps-title" className="overflow-hidden rounded-2xl border border-gray-100 bg-white nice-shadow">
      <div className="flex items-center gap-3.5 border-b border-gray-100 px-5 py-4">
        <svg viewBox="0 0 52 52" className="h-12 w-12 shrink-0 text-gray-900" aria-hidden="true">
          <circle cx="26" cy="26" r="21" fill="none" className="stroke-gray-100" strokeWidth="6" />
          <circle cx="26" cy="26" r="21" fill="none" stroke="#22c55e" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - data.done / Math.max(data.total, 1))} transform="rotate(-90 26 26)" style={{ transition: 'stroke-dashoffset .6s' }} />
          <text x="26" y="30.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">{data.done}/{data.total}</text>
        </svg>
        <div className="min-w-0">
          <h2 id="first-steps-title" className="text-base font-bold text-gray-900">First steps</h2>
          <p className="text-xs text-gray-500">{sub}</p>
        </div>
        {all ? <button type="button" onClick={onDismiss} className="ml-auto rounded-full bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800">Dismiss</button>
          : <button type="button" onClick={onDismiss} aria-label="Dismiss First steps" title="Dismiss" className="ml-auto self-start rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={16} /></button>}
      </div>
      <ol className="divide-y divide-gray-100">
        {rows.map((row) => <StepRow key={row.key} row={row} current={row.key === next?.key} />)}
      </ol>
    </section>
  )
}

function StepRow({ row, current }: { row: Row; current: boolean }) {
  const action = cn('inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold', current ? 'bg-gray-900 text-white hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100')
  return (
    <li className={cn('flex items-center gap-3 px-5 py-3', current && 'bg-gray-50/80')}>
      {row.done
        ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"><Check size={14} strokeWidth={3} /><span className="sr-only">Done:</span></span>
        : <span aria-hidden="true" className={cn('h-6 w-6 shrink-0 rounded-full border-2', current ? 'border-[var(--org-primary-color)]' : 'border-gray-300')} />}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-semibold', row.done ? 'text-gray-400' : 'text-gray-900')}>
          {row.title}{row.optional ? <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-px text-[10px] font-semibold text-gray-500">Optional</span> : null}
        </span>
        {row.done ? (row.note ? <span className="block text-xs font-medium text-green-700">{row.note}</span> : null) : <span className="block text-xs text-gray-500">{row.detail}</span>}
      </span>
      <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline', SPACE_TONE[row.space])}>{row.space}</span>
      {row.done ? <span className="w-[72px] shrink-0" aria-hidden="true" /> : row.href
        ? <Link href={row.href} onClick={row.onOpen} className={action}>{row.action}<ArrowRight size={13} /></Link>
        : <button type="button" onClick={row.onOpen} className={action}>{row.action}<ArrowRight size={13} /></button>}
    </li>
  )
}
