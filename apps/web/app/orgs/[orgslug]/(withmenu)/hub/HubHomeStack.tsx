'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, Compass, HeartHandshake } from 'lucide-react'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { actionableHubActions, HUB_NEXT_ACTIONS_PATH, type HubNextAction } from '@services/hub/nextActions'
import { swrFetcher } from '@services/utils/ts/requests'
import HubLaunchCards from './HubLaunchCards'

const CHECK_IN = 'Can you check in with me on my plans? Help me pick the next small thing to do.'

// Top of the full Hub: ranked next steps for learners with plan work, launch cards for everyone else.
// It always renders something, including while loading and when next actions cannot be fetched.
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
  const { data, isLoading } = useSWR<HubNextAction[]>(token ? `${getAPIUrl()}${HUB_NEXT_ACTIONS_PATH}` : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const actions = actionableHubActions(data)

  if (isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted/50 motion-reduce:animate-none" role="status" aria-label="Loading your next steps" />
  if (actions.length === 0) return <HubLaunchCards token={token} disabled={disabled} onPick={onPick} />

  return (
    <section aria-label="Your next steps" className="space-y-3 pb-1">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-sm font-medium text-foreground">What to do next</h2>
        <Link href={getUriWithOrg(orgslug, routePaths.org.plans())} className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">All plans</Link>
      </div>
      <ul className="grid gap-3">
        {actions.map((action, index) => (
          <li key={`${action.plan_uuid}:${action.objective_uuid}`}>
            <Link href={getUriWithOrg(orgslug, action.route)} className={`group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${index === 0 ? 'border-primary/30' : 'border-border'}`}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Compass className="size-4" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{action.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{action.reason}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" disabled={disabled} onClick={() => onPick(CHECK_IN)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-left transition hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><HeartHandshake className="size-4" aria-hidden /></span>
        <span className="text-sm font-medium text-foreground">Check in with your coach</span>
      </button>
    </section>
  )
}
