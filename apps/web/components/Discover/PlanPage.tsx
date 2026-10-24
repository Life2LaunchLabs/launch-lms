'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate as mutateGlobal } from 'swr'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Play, ShieldCheck } from 'lucide-react'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { badgeKindLabel } from '@services/badges/badges'
import { DISCOVER_FEED_KEY, planJoiningApi, type PlanOfferCard, type PublicPlanPage } from '@services/goals/planJoining'
import { CHUNKY, PlanArt } from './PlanArt'
import { cn } from '@/lib/utils'

type Action = { label: string; href?: string; onClick?: () => void; disabled?: boolean; busy?: boolean }

function ActionButton({ action, className }: { action: Action; className?: string }) {
  const body = <>{action.busy ? <Loader2 size={18} className="animate-spin" /> : null}{action.label}</>
  if (action.href) return <Link href={action.href} className={cn(CHUNKY, 'no-underline', className)}>{body}</Link>
  return <button type="button" onClick={action.onClick} disabled={action.disabled || action.busy} className={cn(CHUNKY, className)}>{body}</button>
}

function OrgLogo({ org }: { org: NonNullable<PlanOfferCard['org']> }) {
  const [failed, setFailed] = React.useState(false)
  if (!org.logo_image || !org.org_uuid || failed) return <>{org.name.slice(0, 1)}</>
  return <img src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt="" onError={() => setFailed(true)} className="h-full w-full object-contain p-1.5" />
}

const stepCount = (page: PublicPlanPage) => page.stages.reduce((total, stage) => total + stage.steps.length, 0)

function Hero({ page, action, note }: { page: PublicPlanPage; action: Action; note?: string }) {
  const steps = stepCount(page)
  const chips = [steps ? `${steps} step${steps === 1 ? '' : 's'}` : '', page.stages.length > 1 ? `${page.stages.length} stages` : '', page.badge ? `Earns a ${badgeKindLabel(page.badge.kind).toLowerCase()}` : ''].filter(Boolean)
  const art = { template_uuid: page.template_uuid, title: page.title, thumbnail_image: page.thumbnail_image, icon: page.icon, color: page.color, badge: page.badge }
  return <section className="relative overflow-hidden bg-[#2E62C9] bg-[url('/rough_blue_background.png')] bg-cover bg-center">
    <div className="absolute inset-0 bg-[url('/landing/cta.png')] bg-cover bg-center opacity-40" aria-hidden="true" />
    <div className="relative mx-auto max-w-[1056px] px-4 pb-16 pt-6 sm:px-6">
      <div className="mt-3 flex flex-wrap-reverse items-center gap-10">
        <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-[18px]">
          {page.creator ? <span className="self-start rounded-full bg-card px-3 py-1.5 text-xs font-black uppercase tracking-[.08em] text-foreground">By {page.creator.name}</span> : null}
          <h1 className="m-0 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">{page.title}</h1>
          {page.description ? <p className="m-0 max-w-[520px] text-base leading-relaxed text-[#EAF0FF]">{page.description}</p> : null}
          {chips.length ? <div className="flex flex-wrap gap-2">{chips.map((chip) => <span key={chip} className="rounded-full border border-white/30 bg-card/15 px-3 py-1.5 text-sm font-bold text-white">{chip}</span>)}</div> : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-[18px]">
            <ActionButton action={action} className="min-h-11 px-6 text-sm" />
            {note ? <span className="max-w-[240px] text-sm text-[#EAF0FF]">{note}</span> : null}
          </div>
        </div>
        <div className="relative flex min-h-[260px] flex-[1_1_320px] items-center justify-center sm:min-h-[340px]">
          <div aria-hidden="true" className="absolute h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.38)_0%,rgba(255,255,255,0)_68%)]" />
          <span className="relative -rotate-3"><PlanArt card={art} size={240} /></span>
        </div>
      </div>
    </div>
  </section>
}

/** What the plan asks of the learner, stage by stage, ending in its badge when it earns one. */
function Outline({ page }: { page: PublicPlanPage }) {
  if (!stepCount(page)) return null
  const stages = page.stages.filter((stage) => stage.steps.length)
  const starts = stages.map((_, stageIndex) => stages.slice(0, stageIndex).reduce((total, stage) => total + stage.steps.length, 0))
  return <section id="criteria" aria-labelledby="outline-title" className="flex flex-col gap-4">
    <h2 id="outline-title" className="m-0 text-2xl font-semibold leading-tight tracking-tight">What you’ll do</h2>
    <div className="flex flex-col gap-4 rounded-[28px] bg-card p-6 sm:p-7">
      {stages.map((stage, stageIndex) => <div key={`${stage.title}-${stageIndex}`} className="flex flex-col gap-3">
        {page.stages.length > 1 ? <h3 className="m-0 text-sm font-black uppercase tracking-[.08em] text-muted-foreground">{stage.title}</h3> : null}
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {stage.steps.map((step, index) => {
            const number = starts[stageIndex] + index + 1
            return <li key={`${step.title}-${index}`} className="flex items-start gap-3.5">
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-[#111318] text-sm font-black', step.type === 'activity' ? 'bg-[#DCE6FB] text-[#111318]' : 'bg-card')}>
                {step.type === 'activity' ? <Play size={14} fill="currentColor" aria-label="Activity" /> : number}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 pt-1.5">
                <strong className="text-[15px] leading-tight">{step.title}</strong>
                {step.description ? <span className="line-clamp-2 text-sm text-muted-foreground">{step.description}</span> : null}
              </span>
            </li>
          })}
        </ol>
      </div>)}
      {page.badge ? <div className="flex items-center gap-3.5 border-t border-border pt-4">
        <BadgeMedal badge={page.badge} size={40} />
        <strong className="text-[15px]">The {badgeKindLabel(page.badge.kind).toLowerCase()} is yours</strong>
      </div> : null}
    </div>
  </section>
}

/** The badge the plan earns, as its Open Badge says it: kind, skills, who made it, what it lines up with. */
function BadgeFacts({ page }: { page: PublicPlanPage }) {
  const badge = page.badge
  if (!badge) return null
  const facts = [
    ['Kind', badgeKindLabel(badge.kind)],
    ['Made by', badge.creator?.name || ''],
    ['Version', badge.version || ''],
    ['Code', badge.human_code || ''],
    ['Field of study', badge.field_of_study || ''],
    ['Specialization', badge.specialization || ''],
    ['Credits', badge.credits_available != null ? String(badge.credits_available) : ''],
  ].filter(([, value]) => value)
  return <section aria-labelledby="badge-title" className="flex flex-col gap-4">
    <h2 id="badge-title" className="m-0 text-2xl font-semibold leading-tight tracking-tight">The badge</h2>
    <div className="flex flex-wrap items-start gap-6 rounded-[28px] bg-card p-6 sm:p-7">
      <BadgeMedal badge={badge} size={112} />
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-2xl leading-tight">{badge.name}</strong>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#DDF1E8] px-2.5 py-1 text-xs font-black text-[#0B5F57]"><ShieldCheck size={13} aria-hidden="true" />Open Badge</span>
        </div>
        {badge.skills.length ? <div className="flex flex-wrap gap-1.5">{badge.skills.map((skill) => <span key={skill} className="rounded-full bg-raised px-2.5 py-1 text-xs font-bold">{skill}</span>)}</div> : null}
        <dl className="m-0 grid gap-x-6 gap-y-2 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {facts.map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="m-0 text-sm font-semibold">{value}</dd></div>)}
        </dl>
        {badge.alignment.length ? <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Counts toward</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">{badge.alignment.map((item) => <li key={item.node_uuid} id={item.node_uuid} className="text-sm"><b>{item.code ? `${item.code} ` : ''}{item.name}</b>{item.framework ? <span className="text-muted-foreground"> · {item.framework}</span> : null}</li>)}</ul>
        </div> : null}
      </div>
    </div>
  </section>
}

function accessLabel(offer: PlanOfferCard): string {
  if (offer.state === 'requested') return 'Request sent'
  return offer.access === 'open' ? 'Open' : 'Ask to join'
}

/** Who offers the plan: the learner picks one when more than one organization runs it. */
function JoinWith({ page, selected, onSelect, action }: { page: PublicPlanPage; selected: PlanOfferCard; onSelect: React.Dispatch<PlanOfferCard>; action: Action }) {
  const [changing, setChanging] = React.useState(false)
  const others = page.offers.length - 1
  const org = selected.org!
  return <section aria-labelledby="join-title" className="flex flex-col gap-4">
    <h2 id="join-title" className="m-0 text-2xl font-semibold leading-tight tracking-tight">Who you’ll do it with</h2>
    <div className="overflow-hidden rounded-[28px] bg-card">
      <div className="flex flex-wrap items-center gap-[18px] bg-muted px-6 py-6 sm:px-7">
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#111318] text-lg font-black text-white"><OrgLogo org={org} /></span>
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
          <strong className="text-2xl leading-tight">With {org.name}</strong>
          <span className="text-[15px] text-muted-foreground">{selected.access === 'open' ? 'Start right away' : `${org.name} says yes first`}{page.badge ? ` · they award the ${badgeKindLabel(page.badge.kind).toLowerCase()}` : ''}</span>
        </div>
        {others > 0 && !page.goal ? <button type="button" onClick={() => setChanging(!changing)} aria-expanded={changing}
          className="min-h-11 px-2 text-[15px] font-black text-[#2B5FD9]">{changing ? 'Done' : `${others} other option${others === 1 ? '' : 's'}`}</button> : null}
        <ActionButton action={action} className="h-[54px] text-[17px]" />
      </div>
      {changing ? <div role="group" aria-label="Organizations offering this plan" className="grid gap-3 border-t border-border bg-muted px-6 py-4 sm:grid-cols-2 sm:px-7 lg:grid-cols-3">
        {page.offers.map((offer) => {
          const active = offer.org?.id === org.id
          return <button key={offer.org?.id} type="button" aria-pressed={active} onClick={() => { onSelect(offer); setChanging(false) }}
            className={cn('flex flex-col gap-1 rounded-2xl border-2 bg-card p-4 text-left transition', active ? 'border-[#2B5FD9]' : 'border-transparent hover:border-[#C9D6F5]')}>
            <span className="flex items-center justify-between gap-2"><strong className="text-base">{offer.org?.name}</strong>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide', offer.access === 'open' ? 'bg-[#D7F25C] text-foreground' : 'bg-[#EDEFF5] text-muted-foreground')}>{accessLabel(offer)}</span></span>
            {active ? <span className="inline-flex items-center gap-1 text-xs font-black text-[#2B5FD9]"><Check size={13} />Selected</span> : null}
          </button>
        })}
      </div> : null}
    </div>
  </section>
}

/**
 * A plan learners can join, as Discover shows it: what it asks, the badge it earns, and who offers it.
 * It's also the criteria page of the plan's badge, so it reads well when nobody offers the plan.
 */
export default function PlanPage({ orgslug, orgId, initialPage }: { orgslug: string; orgId?: number; initialPage: PublicPlanPage }) {
  const router = useRouter()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: page = initialPage, mutate } = useSWR(['public-plan', initialPage.template_uuid, orgId, token || 'public'],
    () => planJoiningApi.plan(initialPage.template_uuid, token, orgId), { fallbackData: initialPage, revalidateOnMount: Boolean(token) })
  const [selectedOrg, setSelectedOrg] = React.useState<number | null>(null)
  const selected = page.offers.find((offer) => offer.org?.id === selectedOrg) || page.offers[0]
  const [busy, setBusy] = React.useState(false)
  const refresh = () => Promise.all([mutate(), mutateGlobal((key) => Array.isArray(key) && key[0] === DISCOVER_FEED_KEY)])

  const join = async (offer: PlanOfferCard) => {
    setBusy(true)
    try {
      const result = await planJoiningApi.join(page.template_uuid, offer.org!.id, token)
      if (result.status === 'joined') {
        toast.success('Added to Plans')
        await refresh()
        router.push(getUriWithOrg(orgslug, routePaths.org.plan(result.goal_uuid)))
        return
      }
      toast.success(`Request sent to ${offer.org!.name}.`)
      await refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not join this plan.')
    } finally {
      setBusy(false)
    }
  }
  const cancel = async (offer: PlanOfferCard) => {
    setBusy(true)
    try {
      await planJoiningApi.cancel(page.template_uuid, offer.org!.id, token)
      await refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not take back your request.')
    } finally {
      setBusy(false)
    }
  }

  const here = getUriWithOrg(orgslug, routePaths.org.discoverPlan(page.template_uuid))
  const earned = page.offers.some((offer) => offer.state === 'earned')
  const action: Action = page.goal ? { label: page.goal.status === 'finished' ? 'See your plan' : 'Keep going', href: getUriWithOrg(orgslug, routePaths.org.plan(page.goal.goal_uuid)) }
    : earned ? { label: 'You earned this', href: getUriWithOrg(orgslug, routePaths.org.portfolioBadges()) }
    : !selected ? { label: 'Not open to join', disabled: true }
    : !token ? { label: 'Sign in to join', href: `/login?next=${encodeURIComponent(here)}` }
    : selected.state === 'requested' ? { label: 'Take back request', onClick: () => void cancel(selected), busy }
    : selected.access === 'open' ? { label: 'Start this plan', onClick: () => void join(selected), busy }
    : { label: `Ask ${selected.org?.name}`, onClick: () => void join(selected), busy }
  const note = page.goal || earned ? undefined
    : !selected ? 'No organization offers this plan to learners right now.'
    : selected.state === 'requested' ? `${selected.org?.name} will let you know.`
    : selected.access === 'open' ? 'It shows up in Plans as soon as you start.' : undefined

  return <div className="min-h-screen bg-background text-[15px] leading-[1.45] text-foreground">
    <div className="mx-auto max-w-[1056px] px-6"><ContentPageHeader orgslug={orgslug} backLabel="Discover" onBack={() => router.push(getUriWithOrg(orgslug, routePaths.org.discover()))} noBottomMargin noHorizontalBleed /></div>
    <Hero page={page} action={action} note={note} />
    <main className="mx-auto flex max-w-[1056px] flex-col gap-8 px-4 pb-24 pt-6 sm:px-6">
      <Outline page={page} />
      <BadgeFacts page={page} />
      {selected ? <JoinWith page={page} selected={selected} onSelect={(offer) => setSelectedOrg(offer.org?.id ?? null)} action={action} /> : null}
    </main>
  </div>
}
