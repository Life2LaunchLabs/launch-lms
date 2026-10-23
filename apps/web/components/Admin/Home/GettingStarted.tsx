'use client'
import React from 'react'
import Link from 'next/link'
import { ArrowRight, Check, X } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { GettingStarted as GettingStartedData, GettingStartedStepKey } from '@services/goals/adminHome'
import { cn } from '@/lib/utils'

const admin = routePaths.org.admin

/** What each step says and where it sends the admin. The API decides which are done. */
const STEPS: Record<GettingStartedStepKey, { title: string; detail: string; action: string; href: () => string }> = {
  plan: { title: 'Add plans to your library', detail: 'Start from Discover or build your own.', action: 'Browse', href: () => admin.discover() },
  organization: { title: 'Add your logo and details', detail: 'So people know who invited them.', action: 'Add', href: () => admin.organization.branding() },
  staff: { title: 'Add your staff', detail: 'Give each person the permissions they need.', action: 'Add staff', href: () => admin.people.root({ invite: 'staff' }) },
  groups: { title: 'Set up groups', detail: 'Cohorts, classes or teams.', action: 'Add groups', href: () => admin.people.root() },
  requirements: { title: 'Add requirements', detail: 'Link steps to what you report on.', action: 'Add', href: () => admin.requirements() },
  learners: { title: 'Bring in learners', detail: 'Send an email invite or share a join link.', action: 'Invite', href: () => admin.people.root({ invite: 'learner' }) },
  assign: { title: 'Hand out your first plan', detail: 'They get their own copy and start on step one.', action: 'Assign', href: () => admin.plans() },
}

/**
 * Home's checklist for a new organization's admin: ticks itself off from the org's data (including
 * what /start already did), and can be dismissed. `side` is the narrow version beside the widgets
 * once a plan is out, with done steps tucked away.
 */
export default function GettingStarted({ data, orgslug, onDismiss, side = false }: { data: GettingStartedData; orgslug: string; onDismiss: () => void; side?: boolean }) {
  const next = data.steps.find((step) => !step.done && !step.optional) || data.steps.find((step) => !step.done)
  const shown = side ? data.steps.filter((step) => !step.done) : data.steps
  const circumference = 2 * Math.PI * 21
  return (
    <section aria-labelledby="getting-started-title" className={cn('relative overflow-hidden rounded-xl bg-white nice-shadow', side ? 'xl:sticky xl:top-6' : 'mb-6')}>
      <div className="flex items-center gap-3.5 border-b border-gray-100 px-5 py-4">
        <svg viewBox="0 0 52 52" className="h-12 w-12 shrink-0" aria-hidden="true">
          <circle cx="26" cy="26" r="21" fill="none" stroke="#f1f1f1" strokeWidth="6" />
          <circle cx="26" cy="26" r="21" fill="none" stroke="#22c55e" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - data.done / data.total)} transform="rotate(-90 26 26)" style={{ transition: 'stroke-dashoffset .6s' }} />
          <text x="26" y="30.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">{data.done}/{data.total}</text>
        </svg>
        <div className="min-w-0">
          <h2 id="getting-started-title" className="text-base font-bold text-gray-900">Get started</h2>
          <p className="text-xs text-gray-500">{side ? 'Keep going when you have a minute.' : data.from_setup ? 'Picked up from your setup. A few steps to your first learner on a plan.' : 'A few steps to your first learner on a plan.'}</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss getting started" title="Dismiss" className="ml-auto self-start rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={16} /></button>
      </div>
      <ol className="divide-y divide-gray-100">
        {shown.map((step) => {
          const copy = STEPS[step.key]
          const current = step.key === next?.key
          return (
            <li key={step.key} className={cn('flex items-center gap-3 px-5 py-3', current && 'bg-gray-50/80')}>
              {step.done
                ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"><Check size={14} strokeWidth={3} /><span className="sr-only">Done:</span></span>
                : <span aria-hidden="true" className={cn('h-6 w-6 shrink-0 rounded-full border-2', current ? 'border-[var(--org-primary-color)]' : 'border-gray-300')} />}
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-semibold', step.done ? 'text-gray-400' : 'text-gray-900')}>
                  {copy.title}{step.optional ? <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-px text-[10px] font-semibold text-gray-500">Optional</span> : null}
                </span>
                {step.done ? (step.note ? <span className="block text-xs font-medium text-green-700">{step.note}</span> : null) : <span className="block text-xs text-gray-500">{copy.detail}</span>}
              </span>
              {step.done ? null : (
                <Link href={getUriWithOrg(orgslug, copy.href())}
                  className={cn('inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold', current ? 'bg-gray-900 text-white hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100')}>
                  {copy.action}<ArrowRight size={13} />
                </Link>
              )}
            </li>
          )
        })}
      </ol>
      {side && data.done ? <p className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-400">{data.done} done · finished steps are tucked away</p> : null}
    </section>
  )
}
