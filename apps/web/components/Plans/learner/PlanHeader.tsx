'use client'

import React from 'react'
import { Award, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { planVars } from './planColors'

const RULES: Record<string, string> = { any: 'Any order', in_order: 'Steps open in order', by_chapter: 'Chapters open in turn' }

type PlanSummary = { plan_uuid: string; slug: string; name: string; progress_percent?: number; is_mine?: boolean; subject?: { name: string } | null }

/** A plan's badge sticker, or a target when it has no badge. */
export function PlanMark({ badge, size = 'md' }: { badge?: any; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-16 w-16 rounded-2xl'
  return <span className={cn('flex shrink-0 items-center justify-center bg-black/15', box)} aria-hidden="true">
    {badge?.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className={cn('badge-sticker-image object-contain', size === 'sm' ? 'h-8 w-8' : 'h-14 w-14')} /> : badge ? <Award size={size === 'sm' ? 20 : 30} /> : <Target size={size === 'sm' ? 20 : 30} />}
  </span>
}

/** A progress bar on a plan's deep color. */
export function PlanProgress({ percent, label }: { percent: number; label: string }) {
  return <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-3 min-w-24 flex-1 overflow-hidden rounded-full bg-black/20">
    <span className="block h-full rounded-full bg-[var(--plan-deep-ink)] transition-[width] duration-500" style={{ width: `${Math.max(percent ? 4 : 0, percent)}%` }} />
  </div>
}

/** The open plan's header: where it came from, its goal, how far along it is, and its actions. */
export function PlanHeaderCard({ detail, done, total, actions }: { detail: any; done: number; total: number; actions?: React.ReactNode }) {
  const percent = total ? Math.round((done * 100) / total) : 0
  const badge = detail.source_badge
  const source = badge ? `Earning with ${detail.source_organization?.name || 'your issuer'}` : detail.source_organization?.name ? `From ${detail.source_organization.name}` : detail.is_mine === false && detail.subject?.name ? `For ${detail.subject.name}` : 'Your plan'
  return <section aria-label={detail.name} className="flex h-full flex-col gap-4 rounded-3xl bg-[var(--plan-deep)] p-5 text-[var(--plan-deep-ink)] shadow-[0_6px_0_var(--plan-deep-edge)]">
    <div className="flex items-start gap-4">
      <PlanMark badge={badge} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wider opacity-80">{source}</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{detail.name}</h1>
      </div>
    </div>
    {detail.description ? <p className="line-clamp-3 text-sm opacity-90">{detail.description}</p> : null}
    {detail.source_assignment?.welcome_message ? <p className="text-sm opacity-90">{detail.source_assignment.welcome_message}</p> : null}
    <div className="flex flex-wrap items-center gap-3">
      <PlanProgress percent={percent} label="Plan progress" />
      <span className="text-xs font-bold">{done} of {total} done</span>
      <span className="text-xs opacity-80">{RULES[detail.step_order] || RULES.any}</span>
    </div>
    {actions}
  </section>
}

/** Another plan in the carousel: a full card peeking on phones, a spine beside the open plan on wider screens. */
function PlanPeek({ plan, color, onChoose }: { plan: PlanSummary; color: string; onChoose: () => void }) {
  const percent = Math.round(plan.progress_percent || 0)
  return <button type="button" data-plan-card={plan.plan_uuid} onClick={onChoose} aria-label={`Open ${plan.name}, ${percent}% done`} style={planVars(color)}
    className="flex w-[86%] shrink-0 snap-center flex-col justify-end gap-3 rounded-3xl bg-[var(--plan-deep)] p-5 text-left text-[var(--plan-deep-ink)] opacity-70 shadow-[0_6px_0_var(--plan-deep-edge)] transition hover:opacity-100 md:w-14 md:items-center md:justify-start md:px-0 md:py-5 md:opacity-90">
    <span className="text-xl font-extrabold leading-tight md:hidden">{plan.name}</span>
    <span className="flex items-center gap-3 md:hidden"><PlanProgress percent={percent} label={`${plan.name} progress`} /><span className="text-xs font-bold">{percent}%</span></span>
    <span className="hidden max-h-64 truncate text-sm font-extrabold [writing-mode:vertical-rl] md:block">{plan.name}</span>
  </button>
}

/**
 * The open plan's header among the learner's other plans. Phones swipe between plans,
 * with neighbours peeking at the edges; wider screens show the others as spines.
 */
// eslint-disable-next-line no-unused-vars
export function PlanCarousel({ plans, activeUuid, getPlanColor, choose, children }: { plans: PlanSummary[]; activeUuid: string; getPlanColor: (uuid?: string) => string; choose: (plan: PlanSummary) => void; children: React.ReactNode }) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const settle = React.useRef<number | undefined>(undefined)
  const inList = plans.some((plan) => plan.plan_uuid === activeUuid)

  React.useLayoutEffect(() => {
    const box = scroller.current
    const card = box?.querySelector<HTMLElement>(`[data-plan-card="${activeUuid}"]`)
    if (box && card && box.scrollWidth > box.clientWidth) box.scrollLeft = card.offsetLeft - (box.clientWidth - card.clientWidth) / 2
  }, [activeUuid])
  React.useEffect(() => () => window.clearTimeout(settle.current), [])

  if (!inList || plans.length < 2) return <>{children}</>
  // When a swipe comes to rest on another plan, open it.
  const onScroll = () => {
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const box = scroller.current
      if (!box || box.scrollWidth <= box.clientWidth) return
      const middle = box.scrollLeft + box.clientWidth / 2
      const cards = Array.from(box.querySelectorAll<HTMLElement>('[data-plan-card]'))
      const nearest = cards.reduce((best, card) => Math.abs(card.offsetLeft + card.clientWidth / 2 - middle) < Math.abs(best.offsetLeft + best.clientWidth / 2 - middle) ? card : best, cards[0])
      const plan = plans.find((item) => item.plan_uuid === nearest?.dataset.planCard)
      if (plan && plan.plan_uuid !== activeUuid) choose(plan)
    }, 140)
  }
  return <div ref={scroller} onScroll={onScroll} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7%] pb-3 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0 md:pb-1.5">
    {plans.map((plan) => plan.plan_uuid === activeUuid
      ? <div key={plan.plan_uuid} data-plan-card={plan.plan_uuid} className="w-[86%] shrink-0 snap-center md:w-auto md:flex-1">{children}</div>
      : <PlanPeek key={plan.plan_uuid} plan={plan} color={getPlanColor(plan.plan_uuid)} onChoose={() => choose(plan)} />)}
  </div>
}
