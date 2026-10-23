'use client'

import React from 'react'
import Link from 'next/link'
import { useOrg } from '@components/Contexts/OrgContext'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import MarketplaceRequests from '@components/Plans/requests/MarketplaceRequests'
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
  const tabs: Array<{ id: PlansTabId; label: string; count?: number }> = [
    { id: 'plans', label: 'Plans', count: summary?.plans },
    { id: 'discover', label: 'Discover' },
  ]
  if (summary?.assignments || tab === 'assignments') tabs.push({ id: 'assignments', label: 'Assignments', count: summary?.assignments })
  if (summary?.frameworks || tab === 'requirements') tabs.push({ id: 'requirements', label: 'Requirements' })

  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-7 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">Plans</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{LEDE[tab]}</p>
        </div>
        <div className="flex items-center gap-2">
          {summary?.requests ? <RequestsButton count={summary.requests} /> : null}
          {canEdit ? <NewPlanModal orgslug={orgslug} /> : null}
        </div>
      </header>
      <nav aria-label="Plans pages" className="mt-5 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {tabs.map(({ id, label, count }) => <Link key={id} href={getUriWithOrg(orgslug, routePaths.org.admin.plans(id))} aria-current={tab === id ? 'page' : undefined}
          className={cn('-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-sm font-bold transition-colors',
            tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {label}{count ? <span className="rounded-full bg-muted px-[7px] py-px text-[11px]">{count}</span> : null}
        </Link>)}
      </nav>
      <div className="pt-7">{children}</div>
    </div>
  </div>
}

/** Other organizations asking to use this one's plans, for its admins to answer. */
function RequestsButton({ count }: { count: number }) {
  const [open, setOpen] = React.useState(false)
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="lg" dialogTitle="Requests" dialogDescription="Organizations asking to use your plans and badges."
    dialogTrigger={<button type="button" aria-label={`${count} ${count === 1 ? 'request' : 'requests'} waiting`} className="inline-flex h-10 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100">
      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-600 px-1 text-[11px] font-bold text-white">{count}</span>{count === 1 ? 'Request' : 'Requests'}
    </button>}
    dialogContent={<MarketplaceRequests />} />
}
