'use client'

import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Award, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { planVars } from './planColors'

const RULES: Record<string, string> = { any: 'Any order', in_order: 'Steps open in order', by_chapter: 'Chapters open in turn' }

export type PlanSummary = {
  plan_uuid: string; slug: string; name: string; progress_percent?: number; is_mine?: boolean; subject?: { name: string } | null
  target_name?: string; badge?: any; source_badge?: any; source_organization?: { name?: string } | null
}

/** How the morph between a plan's tab, its header and its spine moves. */
export const PLAN_MORPH = { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } as const
export const planMorphId = (planUuid: string) => `plan-card-${planUuid}`
const planMarkId = (planUuid: string) => `plan-mark-${planUuid}`

/** Where a plan comes from, as the small line over its name. */
export function planSource(plan: any, fallback = '') {
  const badge = plan.source_badge || plan.badge
  if (badge) return `Earning with ${plan.source_organization?.name || 'your issuer'}`
  if (plan.source_organization?.name) return `From ${plan.source_organization.name}`
  const forWhom = plan.is_mine === false ? plan.subject?.name || plan.target_name : ''
  return forWhom ? `For ${forWhom}` : fallback
}

/** A card's own contents fade in once it lands, so they never stretch while the card morphs. */
function Settle({ className, children }: { className?: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  return <motion.div className={className} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: 0.12 }}>{children}</motion.div>
}

/** A plan's badge sticker, or a target when it has no badge. */
export function PlanMark({ badge, size = 'md', layoutId }: { badge?: any; size?: 'sm' | 'md'; layoutId?: string }) {
  const box = size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-16 w-16 rounded-2xl'
  return <motion.span layoutId={layoutId} transition={PLAN_MORPH} className={cn('flex shrink-0 items-center justify-center bg-black/15', box)} aria-hidden="true">
    {badge?.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className={cn('badge-sticker-image object-contain', size === 'sm' ? 'h-8 w-8' : 'h-14 w-14')} /> : badge ? <Award size={size === 'sm' ? 20 : 30} /> : <Target size={size === 'sm' ? 20 : 30} />}
  </motion.span>
}

/** A progress bar on a plan's deep color. */
export function PlanProgress({ percent, label, thin = false }: { percent: number; label: string; thin?: boolean }) {
  return <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className={cn('min-w-16 flex-1 overflow-hidden rounded-full bg-black/20', thin ? 'h-1.5' : 'h-3')}>
    <span className="block h-full rounded-full bg-[var(--plan-deep-ink)] transition-[width] duration-500" style={{ width: `${Math.max(percent ? 4 : 0, percent)}%` }} />
  </div>
}

/**
 * The open plan's header: where it came from, its goal, how far along it is, and its actions.
 * It renders from the plan list's summary while the full plan loads, so opening a plan
 * shows its header at once; ``actions`` hold their place until they are ready.
 */
export function PlanHeaderCard({ detail, done, total, actions, pending = false }: { detail: any; done: number; total: number; actions?: React.ReactNode; pending?: boolean }) {
  const percent = total ? Math.round((done * 100) / total) : 0
  return <motion.section layoutId={planMorphId(detail.plan_uuid)} transition={PLAN_MORPH} style={{ borderRadius: 24 }} aria-label={detail.name} aria-busy={pending || undefined}
    className="flex h-full flex-col bg-[var(--plan-deep)] p-5 text-[var(--plan-deep-ink)] shadow-[0_6px_0_var(--plan-deep-edge)]">
    <div className="flex items-start gap-4">
      <PlanMark badge={detail.source_badge || detail.badge} layoutId={planMarkId(detail.plan_uuid)} />
      <Settle className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wider opacity-80">{planSource(detail, 'Your plan')}</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{detail.name}</h1>
      </Settle>
    </div>
    <Settle className="mt-4 flex flex-col gap-4">
      {detail.description ? <p className="line-clamp-3 text-sm opacity-90">{detail.description}</p> : null}
      {detail.source_assignment?.welcome_message ? <p className="text-sm opacity-90">{detail.source_assignment.welcome_message}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <PlanProgress percent={percent} label="Plan progress" />
        <span className="text-xs font-bold">{done} of {total} done</span>
        <span className="text-xs opacity-80">{RULES[detail.step_order] || RULES.any}</span>
      </div>
      {pending ? <div className="flex h-10 gap-2" aria-hidden="true"><span className="w-32 rounded-xl bg-black/15 motion-safe:animate-pulse" /><span className="flex-1" /><span className="w-10 rounded-xl bg-black/15 motion-safe:animate-pulse" /></div> : actions}
    </Settle>
  </motion.section>
}

type StripProps = {
  plans: PlanSummary[]
  // eslint-disable-next-line no-unused-vars
  getPlanColor: (uuid?: string) => string
  // eslint-disable-next-line no-unused-vars
  choose: (plan: any) => void
  /** Called when the learner shows they may open a plan (hover, focus, touch), to fetch it early. */
  // eslint-disable-next-line no-unused-vars
  onIntent?: (plan: any) => void
}

/** A plan as a tab on the overview: its mark, where it is from, its name and progress. */
function PlanTab({ plan, color, onChoose, onIntent }: { plan: PlanSummary; color: string; onChoose: () => void; onIntent?: () => void }) {
  const percent = Math.round(plan.progress_percent || 0)
  const source = planSource(plan)
  return <motion.button type="button" layoutId={planMorphId(plan.plan_uuid)} transition={PLAN_MORPH} style={{ ...planVars(color), borderRadius: 18 }} data-plan=""
    onClick={onChoose} onPointerEnter={onIntent} onFocus={onIntent} onTouchStart={onIntent} whileTap={{ y: 3 }}
    aria-label={`${plan.name}, ${percent}% complete`}
    className="flex w-[78%] shrink-0 snap-start items-center gap-3 bg-[var(--plan-deep)] px-3 py-2.5 text-left text-[var(--plan-deep-ink)] shadow-[0_4px_0_var(--plan-deep-edge)] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-[46%] md:w-auto">
    <PlanMark badge={plan.badge || plan.source_badge} size="sm" layoutId={planMarkId(plan.plan_uuid)} />
    <Settle className="flex min-w-0 flex-1 flex-col gap-1">
      {source ? <span className="truncate text-[11px] font-extrabold uppercase tracking-wider opacity-80">{source}</span> : null}
      <span className="truncate text-sm font-extrabold leading-tight">{plan.name}</span>
      <span className="flex items-center gap-2"><PlanProgress thin percent={percent} label={`${plan.name} progress`} /><span className="text-[11px] font-bold tabular-nums opacity-90">{percent}%</span></span>
    </Settle>
  </motion.button>
}

/**
 * The learner's plans as tabs on the overview. Each tab shares its identity with the
 * plan's header and spine, so opening one grows the tab into the header.
 */
export function PlanTabs({ plans, getPlanColor, choose, onIntent, children }: StripProps & { children?: React.ReactNode }) {
  return <motion.section layoutScroll aria-label="Your plans" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
    {plans.map((plan) => <PlanTab key={plan.plan_uuid} plan={plan} color={getPlanColor(plan.plan_uuid)} onChoose={() => choose(plan)} onIntent={onIntent ? () => onIntent(plan) : undefined} />)}
    {children}
  </motion.section>
}

/** Another plan beside the open one: a full card peeking on phones, a spine on wider screens. */
function PlanPeek({ plan, color, onChoose, onIntent }: { plan: PlanSummary; color: string; onChoose: () => void; onIntent?: () => void }) {
  const percent = Math.round(plan.progress_percent || 0)
  return <motion.button type="button" layoutId={planMorphId(plan.plan_uuid)} transition={PLAN_MORPH} data-plan-card={plan.plan_uuid} onClick={onChoose} onPointerEnter={onIntent} onFocus={onIntent} onTouchStart={onIntent}
    aria-label={`Open ${plan.name}, ${percent}% done`} style={{ ...planVars(color), borderRadius: 24 }}
    className="flex w-[86%] shrink-0 snap-center flex-col bg-[var(--plan-deep)] p-5 text-left text-[var(--plan-deep-ink)] opacity-70 shadow-[0_6px_0_var(--plan-deep-edge)] transition-opacity hover:opacity-100 md:w-14 md:px-0 md:py-5 md:opacity-90">
    <Settle className="flex flex-1 flex-col justify-end gap-3 md:items-center md:justify-start">
      <span className="text-xl font-extrabold leading-tight md:hidden">{plan.name}</span>
      <span className="flex items-center gap-3 md:hidden"><PlanProgress percent={percent} label={`${plan.name} progress`} /><span className="text-xs font-bold">{percent}%</span></span>
      <span className="hidden max-h-64 truncate text-sm font-extrabold [writing-mode:vertical-rl] md:block">{plan.name}</span>
    </Settle>
  </motion.button>
}

/**
 * The open plan's header among the learner's other plans. Phones swipe between plans,
 * with neighbours peeking at the edges; wider screens show the others as spines.
 */
export function PlanCarousel({ plans, activeUuid, getPlanColor, choose, onIntent, children }: StripProps & { activeUuid: string; children: React.ReactNode }) {
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
  return <motion.div layoutScroll ref={scroller} onScroll={onScroll} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7%] pb-3 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0 md:pb-1.5">
    {plans.map((plan) => plan.plan_uuid === activeUuid
      ? <div key={plan.plan_uuid} data-plan-card={plan.plan_uuid} className="w-[86%] shrink-0 snap-center md:w-auto md:flex-1">{children}</div>
      : <PlanPeek key={plan.plan_uuid} plan={plan} color={getPlanColor(plan.plan_uuid)} onChoose={() => choose(plan)} onIntent={onIntent ? () => onIntent(plan) : undefined} />)}
  </motion.div>
}
