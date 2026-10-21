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
  plan: { title: 'Find your first plan', detail: 'Grab a ready-made plan from the Marketplace, or build your own.', action: 'Browse plans', href: () => admin.marketplace() },
  organization: { title: 'Set up your organization', detail: 'Add a description and your logo so learners know who invited them.', action: 'Add details', href: () => admin.organization.general() },
  learners: { title: 'Add your learners', detail: 'Invite them by email or share a join link.', action: 'Invite learners', href: () => admin.people.root({ invite: 'learner' }) },
  staff: { title: 'Add staff', detail: 'Bring in a co-teacher, parent or mentor to help review work.', action: 'Invite staff', href: () => admin.people.root({ invite: 'staff' }) },
  assign: { title: 'Hand out your first plan', detail: 'Give a plan to a learner and set when each stage opens.', action: 'Hand out a plan', href: () => admin.templates() },
}

/** Home's checklist for a new organization's admin: ticks itself off from the org's data, and can be dismissed. */
export default function GettingStarted({ data, orgslug, onDismiss }: { data: GettingStartedData; orgslug: string; onDismiss: () => void }) {
  const next = data.steps.find((step) => !step.done)
  const percent = Math.round((data.done / data.total) * 100)
  return (
    <section aria-labelledby="getting-started-title" className="relative mb-6 overflow-hidden rounded-xl bg-white nice-shadow">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0">
          <h2 id="getting-started-title" className="text-base font-bold text-gray-900">Getting started</h2>
          <p className="text-xs text-gray-500">A few steps to get your first learners going. They tick off as you do them.</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-100" aria-hidden="true"><div className="h-full rounded-full bg-green-500" style={{ width: `${percent}%` }} /></div>
            <span className="text-xs font-semibold text-gray-500">{data.done} of {data.total}</span>
          </div>
          <button type="button" onClick={onDismiss} aria-label="Dismiss getting started" title="Dismiss" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={16} /></button>
        </div>
      </div>
      <ol className="divide-y divide-gray-100">
        {data.steps.map((step) => {
          const copy = STEPS[step.key]
          const current = step.key === next?.key
          return (
            <li key={step.key} className={cn('flex items-center gap-3 px-5 py-3', current && 'bg-gray-50/80')}>
              {step.done
                ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"><Check size={14} strokeWidth={3} /><span className="sr-only">Done:</span></span>
                : <span aria-hidden="true" className={cn('h-6 w-6 shrink-0 rounded-full border-2', current ? 'border-[var(--org-primary-color)]' : 'border-gray-300')} />}
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-semibold', step.done ? 'text-gray-400 line-through' : 'text-gray-900')}>
                  {copy.title}{step.optional ? <span className="ml-1.5 text-xs font-normal text-gray-400">optional</span> : null}
                </span>
                {step.done ? null : <span className="block text-xs text-gray-500">{copy.detail}</span>}
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
    </section>
  )
}
