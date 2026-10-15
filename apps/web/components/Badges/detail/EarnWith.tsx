'use client'

import React from 'react'
import Link from 'next/link'
import { Check, Loader2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BadgePage, BadgeRoute } from '@services/learning/badgeDiscover'
import { BadgeSticker, CHUNKY } from '@components/Badges/discover/BadgeArt'
import { getOrgLogoMediaDirectory } from '@services/media/media'

export type EarnOption = { route: BadgeRoute; issuer: BadgeRoute['issuers'][number] }

/** Every (route, issuer) pair a learner could pick, the recommended route and startable issuers first. */
export function earnOptions(page: BadgePage): EarnOption[] {
  const options = page.ways.routes.flatMap((route) => route.issuers.map((issuer) => ({ route, issuer })))
  return options.sort((a, b) => Number(b.route.recommended) - Number(a.route.recommended) || Number(b.issuer.can_start) - Number(a.issuer.can_start))
}

export const optionKey = (option: EarnOption) => `${option.route.route_uuid}:${option.issuer.org.id}`

function accessLabel(issuer: EarnOption['issuer']): string {
  if (issuer.can_start) return 'Open'
  if (issuer.request_status === 'pending') return 'Request sent'
  return issuer.access === 'request' ? 'Ask to join' : 'Invite only'
}

function effort(route: BadgeRoute): string {
  const parts = [`${route.step_count} step${route.step_count === 1 ? '' : 's'}`]
  if (route.activity_count) parts.push(`${route.activity_count} activit${route.activity_count === 1 ? 'y' : 'ies'}`)
  return parts.join(' · ')
}

export type EarnAction = { label: string; href?: string; onClick?: () => void; disabled?: boolean; busy?: boolean }

export function ActionButton({ action, className }: { action: EarnAction; className?: string }) {
  const body = <>{action.busy ? <Loader2 size={18} className="animate-spin" /> : null}{action.label}</>
  if (action.href) return <Link href={action.href} className={cn(CHUNKY, 'no-underline', className)}>{body}</Link>
  return <button type="button" onClick={action.onClick} disabled={action.disabled || action.busy} className={cn(CHUNKY, className)}>{body}</button>
}

function IssuerLogo({ org }: { org: EarnOption['issuer']['org'] }) {
  const [failed, setFailed] = React.useState(false)
  if (!org.logo_image || !org.org_uuid || failed) return <>{org.name.slice(0, 1)}</>
  return <img src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt="" onError={() => setFailed(true)} className="h-full w-full object-contain p-1.5" />
}

function Steps({ route, page }: { route: BadgeRoute; page: BadgePage }) {
  const chaptered = new Set(route.steps.map((step) => step.chapter)).size > 1
  return <div className="overflow-x-auto px-6 pb-8 pt-9 sm:px-6">
    <ol className="m-0 flex min-w-max list-none items-start max-sm:min-w-0 max-sm:flex-col max-sm:gap-3 p-0">
      {route.steps.map((step, index) => <li key={`${step.title}-${index}`} className="flex items-start max-sm:w-full">
        <div className="flex w-[132px] flex-col items-center gap-2.5 text-center max-sm:w-full max-sm:flex-row max-sm:text-left">
          <span className={cn('flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-[#111318] text-[22px] font-black', step.kind === 'activity' ? 'bg-[#DCE6FB]' : 'bg-card')}>
            {step.kind === 'activity' ? <Play size={22} fill="currentColor" aria-label="Activity" /> : index + 1}
          </span>
          <strong className="text-[15px] leading-tight">{step.title}</strong>
          {chaptered && step.chapter ? <span className="text-[13px] text-muted-foreground">{step.chapter}</span> : null}
        </div>
        <span aria-hidden="true" className="mt-[33px] block h-1.5 w-7 max-sm:hidden rounded-full bg-[#E3E7F0]" />
      </li>)}
      <li className="flex w-[132px] flex-col items-center gap-2.5 text-center max-sm:w-full max-sm:flex-row max-sm:text-left">
        <BadgeSticker src={page.thumbnail_image} name={page.name} size={72} />
        <strong className="text-[15px] leading-tight">Badge is yours</strong>
      </li>
    </ol>
  </div>
}

/** "How you'll earn it": the chosen way to earn with its issuer and steps, other ways a click away. */
// eslint-disable-next-line no-unused-vars
export default function EarnWith({ page, options, selected, onSelect, action }: { page: BadgePage; options: EarnOption[]; selected: EarnOption; onSelect: (option: EarnOption) => void; action: EarnAction }) {
  const [changing, setChanging] = React.useState(false)
  const others = options.length - 1
  const started = Boolean(page.ways.goal)
  return <section aria-labelledby="earn-title" className="flex flex-col gap-4">
    <h2 id="earn-title" className="m-0 text-2xl font-semibold leading-tight tracking-tight">How you’ll earn it</h2>
    <div className="overflow-hidden rounded-[28px] bg-card">
      <div className="flex flex-wrap items-center gap-[18px] bg-muted px-6 py-6 sm:px-7">
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#111318] text-lg font-black text-white">
          <IssuerLogo org={selected.issuer.org} />
        </span>
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
          <strong className="text-2xl leading-tight">Earn with {selected.issuer.org.name}</strong>
          <span className="text-[15px] text-muted-foreground">{selected.route.name} · {effort(selected.route)}</span>
        </div>
        {others > 0 && !started ? <button type="button" onClick={() => setChanging(!changing)} aria-expanded={changing}
          className="min-h-11 px-2 text-[15px] font-black text-[#2B5FD9]">{changing ? 'Done' : `${others} other option${others === 1 ? '' : 's'}`}</button> : null}
        <ActionButton action={action} className="h-[54px] text-[17px]" />
      </div>
      {changing ? <div role="group" aria-label="Other ways to earn" className="grid gap-3 border-t border-border bg-muted px-6 py-4 sm:grid-cols-2 sm:px-7 lg:grid-cols-3">
        {options.map((option) => {
          const active = optionKey(option) === optionKey(selected)
          return <button key={optionKey(option)} type="button" aria-pressed={active} onClick={() => { onSelect(option); setChanging(false) }}
            className={cn('flex flex-col gap-1 rounded-2xl border-2 bg-card p-4 text-left transition', active ? 'border-[#2B5FD9]' : 'border-transparent hover:border-[#C9D6F5]')}>
            <span className="flex items-center justify-between gap-2"><strong className="text-base">{option.issuer.org.name}</strong>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide', option.issuer.can_start ? 'bg-[#D7F25C] text-foreground' : 'bg-[#EDEFF5] text-muted-foreground')}>{accessLabel(option.issuer)}</span></span>
            <span className="text-sm text-muted-foreground">{option.route.name} · {effort(option.route)}{option.route.recommended ? ' · Recommended' : ''}</span>
            {active ? <span className="inline-flex items-center gap-1 text-xs font-black text-[#2B5FD9]"><Check size={13} />Selected</span> : null}
          </button>
        })}
      </div> : null}
      {selected.route.description ? <p className="m-0 px-6 pt-6 text-base text-[#3A4152] sm:px-6">{selected.route.description}</p> : null}
      <Steps route={selected.route} page={page} />
    </div>
  </section>
}
