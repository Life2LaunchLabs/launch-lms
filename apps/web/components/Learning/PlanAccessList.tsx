'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { cn } from '@/lib/utils'

export type PlanAccess = { route_uuid?: string; template_uuid: string; title: string; access: string }
export type PlanOfferRef = { org: { id: number; name: string }; access: string }

const ACCESS_LABELS: Record<string, string> = { open: 'Open to everyone', request: 'By request', invite: 'Invite only' }
const ACCESS_TONES: Record<string, string> = { open: 'bg-lime-100 text-lime-900', request: 'bg-sky-100 text-sky-900', invite: 'bg-muted text-muted-foreground' }

export function AccessChip({ access, className }: { access: string; className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold', ACCESS_TONES[access] || ACCESS_TONES.invite, className)}>{ACCESS_LABELS[access] || ACCESS_LABELS.invite}</span>
}

/** Who can start each of a badge's plans at one organization. It's set on the plan, so each row links to the plan's Settings. */
export default function PlanAccessList({ plans, orgslug, emptyText = 'Your organization doesn’t run any plan that earns this badge yet.' }: { plans: PlanAccess[]; orgslug: string; emptyText?: string }) {
  return <div>
    <p className="text-sm font-semibold text-foreground">Who can start it</p>
    <p className="mt-0.5 text-xs text-muted-foreground">Set on each plan that earns this badge. Learners find the badge on Discover only while one of its plans is open or by request.</p>
    {plans.length ? <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
      {plans.map((plan) => <li key={plan.route_uuid || plan.template_uuid}>
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.template(plan.template_uuid))} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60">
          <span className="min-w-0 flex-1 truncate font-semibold">{plan.title}</span>
          <AccessChip access={plan.access} />
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </li>)}
    </ul> : <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">{emptyText}</p>}
  </div>
}

/** The organizations offering a plan to learners (open or by request), on one line. */
export function OfferedBy({ offers, className }: { offers: PlanOfferRef[]; className?: string }) {
  const shown = offers.filter((offer) => offer.access === 'open' || offer.access === 'request')
  if (!shown.length) return <p className={cn('text-xs text-muted-foreground', className)}>No organization offers this plan to learners yet, so it isn’t on Discover.</p>
  return <p className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground', className)}>
    <span>Offered to learners by</span>
    {shown.map((offer) => <span key={offer.org.id} className="inline-flex items-center gap-1"><span className="font-semibold text-foreground">{offer.org.name}</span><AccessChip access={offer.access} /></span>)}
  </p>
}
