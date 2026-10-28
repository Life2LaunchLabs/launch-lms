'use client'

import React from 'react'
import Link from 'next/link'
import { useOrg } from '@components/Contexts/OrgContext'
import NewPlanModal from '@components/Plans/create/NewPlanModal'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { PlansTabId } from '@services/routing/paths'
import { cn } from '@/lib/utils'
import { usePlansSummary } from './usePlansSummary'

const LEDE: Record<PlansTabId, string> = {
  plans: 'Paths of steps you assign to learners.',
  discover: 'Ready-made plans and collections from Life2Launch and partners.',
  assignments: 'Who has which plan, and how far along they are.',
  requirements: 'The standards your plans count toward.',
  requests: 'Organizations asking to run your plans, and what you asked for.',
}

/**
 * The Plans area: its title and New plan, then the tabs. Plans and Discover are always there;
 * Assignments shows once something is assigned and Requirements once the org tracks a framework,
 * or while you're on them.
 */
export default function PlansPage({ tab, children }: { tab: PlansTabId; children: React.ReactNode }) {
  const org = useOrg() as { slug?: string } | null
  const orgslug = org?.slug || ''
  const canEdit = useCanEditPlans() === true
  const summary = usePlansSummary()
  const tabs: Array<{ id: PlansTabId; label: string; count?: number; waiting?: boolean }> = [
    { id: 'plans', label: 'Plans', count: summary?.plans },
    { id: 'discover', label: 'Discover' },
  ]
  if (summary?.assignments || tab === 'assignments') tabs.push({ id: 'assignments', label: 'Assignments', count: summary?.assignments })
  if (summary?.frameworks || tab === 'requirements') tabs.push({ id: 'requirements', label: 'Requirements' })
  // Admins answer other organizations here; a count says something is waiting.
  if (summary?.admin || tab === 'requests') tabs.push({ id: 'requests', label: 'Requests', count: summary?.requests, waiting: true })

  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-7 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">Plans</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{LEDE[tab]}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? <NewPlanModal orgslug={orgslug} /> : null}
        </div>
      </header>
      <nav aria-label="Plans pages" className="mt-5 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {tabs.map(({ id, label, count, waiting }) => <Link key={id} href={getUriWithOrg(orgslug, routePaths.org.admin.plans(id))} aria-current={tab === id ? 'page' : undefined}
          className={cn('-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-sm font-bold transition-colors',
            tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {label}{count ? <span className={cn('rounded-full px-[7px] py-px text-[11px]', waiting ? 'bg-amber-600 text-white' : 'bg-muted')}>{count}</span> : null}
        </Link>)}
      </nav>
      <div className="pt-7">{children}</div>
    </div>
  </div>
}
