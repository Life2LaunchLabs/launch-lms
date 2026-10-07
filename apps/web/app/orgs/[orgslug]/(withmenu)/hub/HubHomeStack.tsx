'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, HeartHandshake, ListChecks } from 'lucide-react'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import HubLaunchCards from './HubLaunchCards'

type PlanSummary = {
  plan_uuid: string
  slug: string
  name: string
  is_mine?: boolean
  target_kind?: string
  objective_count?: number
  completed_objective_count?: number
  attention_count?: number
}

const CHECK_IN = 'Can you check in with me on my plans? Help me pick the next small thing to do.'

// Top of the full Hub: a dashboard for learners with plans, launch cards for everyone else.
// It always renders something, including while loading and when plans cannot be fetched.
export default function HubHomeStack({
  orgslug,
  token,
  disabled,
  onPick,
}: {
  orgslug: string
  token?: string
  disabled: boolean
  // eslint-disable-next-line no-unused-vars
  onPick: (_message: string) => void
}) {
  const { data, isLoading } = useSWR<PlanSummary[]>(
    token ? `${getAPIUrl()}planning/plans?lifecycle=active` : null,
    (url: string) => swrFetcher(url, token),
    { revalidateOnFocus: true },
  )
  const plans = (Array.isArray(data) ? data : []).filter((plan) => plan.target_kind !== 'group' && plan.is_mine !== false).slice(0, 3)

  if (isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted/50 motion-reduce:animate-none" role="status" aria-label="Loading your plans" />
  if (plans.length === 0) return <HubLaunchCards disabled={disabled} onPick={onPick} />

  return (
    <section aria-label="Your plans" className="space-y-3 pb-1">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-sm font-medium text-foreground">Pick up where you left off</h2>
        <Link href={getUriWithOrg(orgslug, routePaths.org.plans())} className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">All plans</Link>
      </div>
      <ul className="grid gap-3">
        {plans.map((plan) => {
          const total = plan.objective_count || 0
          const done = plan.completed_objective_count || 0
          return (
            <li key={plan.plan_uuid}>
              <Link href={getUriWithOrg(orgslug, routePaths.org.plan(plan.slug))} className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ListChecks className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{plan.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {total === 0 ? 'Add your first step' : done >= total ? 'All steps done. What\'s next?' : `${done} of ${total} steps done`}
                    {plan.attention_count ? ' · Worth a look' : ''}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
      <button type="button" disabled={disabled} onClick={() => onPick(CHECK_IN)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-left transition hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><HeartHandshake className="size-4" aria-hidden /></span>
        <span className="text-sm font-medium text-foreground">Check in with your coach</span>
      </button>
    </section>
  )
}
