'use client'

import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Award, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { planVars } from '@components/Goals/planColors'
import type { GoalSummary, StepOrder } from '@services/goals/types'

const RULES: Record<StepOrder, string> = { any: 'Any order', in_order: 'Steps open in order', by_stage: 'Stages open in turn' }

export type GoalBadge = { badge_uuid?: string; name?: string; thumbnail_image?: string } | null
/** What a goal's header needs: the goal list's summary, filled in by the full goal once it loads. */
export type HeaderGoal = {
  goal_uuid: string; title: string; description?: string; step_order?: StepOrder
  source_badge?: GoalBadge; organization?: { name?: string } | null; is_subject?: boolean; subject?: { name?: string } | null
}

/** A summary row's badge, organization and subject, typed. */
export function summaryHeader(summary: GoalSummary): HeaderGoal {
  return {
    goal_uuid: summary.goal_uuid, title: summary.title, is_subject: summary.is_subject,
    source_badge: (summary.source_badge as GoalBadge) || null, organization: (summary.organization as { name?: string } | null) || null,
    subject: (summary.subject as { name?: string } | null) || null,
  }
}

export const summaryPercent = (summary: GoalSummary) => typeof summary.progress_percent === 'number'
  ? summary.progress_percent : summary.progress?.total ? Math.round((summary.progress.done * 100) / summary.progress.total) : 0

/** How the morph between a goal's tab, its header and its spine moves. */
export const GOAL_MORPH = { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } as const
export const goalMorphId = (goalUuid: string) => `plan-card-${goalUuid}`
const goalMarkId = (goalUuid: string) => `plan-mark-${goalUuid}`

/** Where a goal comes from, as the small line over its title. */
export function goalSource(goal: HeaderGoal, fallback = '') {
  if (goal.source_badge) return `Earning with ${goal.organization?.name || 'your issuer'}`
  if (goal.organization?.name) return `From ${goal.organization.name}`
  const forWhom = goal.is_subject === false ? goal.subject?.name : ''
  return forWhom ? `For ${forWhom}` : fallback
}

/** A card's own contents fade in once it lands, so they never stretch while the card morphs. */
function Settle({ className, children }: { className?: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  return <motion.div className={className} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: 0.12 }}>{children}</motion.div>
}

/** A goal's badge sticker, or a target when it has no badge. */
export function GoalMark({ badge, size = 'md', layoutId }: { badge?: GoalBadge; size?: 'sm' | 'md'; layoutId?: string }) {
  const box = size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-16 w-16 rounded-2xl'
  return <motion.span layoutId={layoutId} transition={GOAL_MORPH} className={cn('flex shrink-0 items-center justify-center bg-black/15', box)} aria-hidden="true">
    {badge?.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className={cn('badge-sticker-image object-contain', size === 'sm' ? 'h-8 w-8' : 'h-14 w-14')} /> : badge ? <Award size={size === 'sm' ? 20 : 30} /> : <Target size={size === 'sm' ? 20 : 30} />}
  </motion.span>
}

/** A progress bar on a goal's deep colour. */
export function GoalProgress({ percent, label, thin = false }: { percent: number; label: string; thin?: boolean }) {
  return <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className={cn('min-w-16 flex-1 overflow-hidden rounded-full bg-black/20', thin ? 'h-1.5' : 'h-3')}>
    <span className="block h-full rounded-full bg-[var(--plan-deep-ink)] transition-[width] duration-500" style={{ width: `${Math.max(percent ? 4 : 0, percent)}%` }} />
  </div>
}

/**
 * The open goal's header: where it came from, its title, how far along it is, and its actions.
 * It renders from the goal list's summary while the full goal loads, so opening a goal
 * shows its header at once; ``actions`` hold their place until they are ready.
 */
export function GoalHeaderCard({ goal, done, total, actions, pending = false }: { goal: HeaderGoal; done: number; total: number; actions?: React.ReactNode; pending?: boolean }) {
  const percent = total ? Math.round((done * 100) / total) : 0
  return <motion.section layoutId={goalMorphId(goal.goal_uuid)} transition={GOAL_MORPH} style={{ borderRadius: 24 }} aria-label={goal.title} aria-busy={pending || undefined}
    className="flex h-full flex-col bg-[var(--plan-deep)] p-5 text-[var(--plan-deep-ink)] shadow-[0_6px_0_var(--plan-deep-edge)]">
    <div className="flex items-start gap-4">
      <GoalMark badge={goal.source_badge} layoutId={goalMarkId(goal.goal_uuid)} />
      <Settle className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wider opacity-80">{goalSource(goal, 'Your goal')}</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{goal.title}</h1>
      </Settle>
    </div>
    <Settle className="mt-4 flex flex-col gap-4">
      {goal.description ? <p className="line-clamp-3 text-sm opacity-90">{goal.description}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <GoalProgress percent={percent} label="Goal progress" />
        <span className="text-xs font-bold">{done} of {total} done</span>
        <span className="text-xs opacity-80">{RULES[goal.step_order || 'any'] || RULES.any}</span>
      </div>
      {pending ? <div className="flex h-10 gap-2" aria-hidden="true"><span className="w-32 rounded-xl bg-black/15 motion-safe:animate-pulse" /><span className="flex-1" /><span className="w-10 rounded-xl bg-black/15 motion-safe:animate-pulse" /></div> : actions}
    </Settle>
  </motion.section>
}

type StripProps = {
  goals: GoalSummary[]
  // eslint-disable-next-line no-unused-vars
  getGoalColor: (uuid?: string) => string
  // eslint-disable-next-line no-unused-vars
  choose: (goal: GoalSummary) => void
  /** Called when the learner shows they may open a goal (hover, focus, touch), to fetch it early. */
  // eslint-disable-next-line no-unused-vars
  onIntent?: (goal: GoalSummary) => void
}

/** A goal as a tab on the overview: its mark, where it is from, its title and progress. */
function GoalTab({ goal, color, onChoose, onIntent }: { goal: GoalSummary; color: string; onChoose: () => void; onIntent?: () => void }) {
  const percent = Math.round(summaryPercent(goal))
  const header = summaryHeader(goal)
  const source = goalSource(header)
  return <motion.button type="button" layoutId={goalMorphId(goal.goal_uuid)} transition={GOAL_MORPH} style={{ ...planVars(color), borderRadius: 18 }} data-plan=""
    onClick={onChoose} onPointerEnter={onIntent} onFocus={onIntent} onTouchStart={onIntent} whileTap={{ y: 3 }}
    aria-label={`${goal.title}, ${percent}% complete`}
    className="flex w-[78%] shrink-0 snap-start items-center gap-3 bg-[var(--plan-deep)] px-3 py-2.5 text-left text-[var(--plan-deep-ink)] shadow-[0_4px_0_var(--plan-deep-edge)] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-[46%] md:w-auto">
    <GoalMark badge={header.source_badge} size="sm" layoutId={goalMarkId(goal.goal_uuid)} />
    <Settle className="flex min-w-0 flex-1 flex-col gap-1">
      {source ? <span className="truncate text-[11px] font-extrabold uppercase tracking-wider opacity-80">{source}</span> : null}
      <span className="truncate text-sm font-extrabold leading-tight">{goal.title}</span>
      <span className="flex items-center gap-2"><GoalProgress thin percent={percent} label={`${goal.title} progress`} /><span className="text-[11px] font-bold tabular-nums opacity-90">{percent}%</span></span>
    </Settle>
  </motion.button>
}

/**
 * The learner's goals as tabs on the overview. Each tab shares its identity with the
 * goal's header and spine, so opening one grows the tab into the header.
 */
export function GoalTabs({ goals, getGoalColor, choose, onIntent, children }: StripProps & { children?: React.ReactNode }) {
  return <motion.section layoutScroll aria-label="Your goals" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
    {goals.map((goal) => <GoalTab key={goal.goal_uuid} goal={goal} color={getGoalColor(goal.goal_uuid)} onChoose={() => choose(goal)} onIntent={onIntent ? () => onIntent(goal) : undefined} />)}
    {children}
  </motion.section>
}

/** Another goal beside the open one: a full card peeking on phones, a spine on wider screens. */
function GoalPeek({ goal, color, onChoose, onIntent }: { goal: GoalSummary; color: string; onChoose: () => void; onIntent?: () => void }) {
  const percent = Math.round(summaryPercent(goal))
  return <motion.button type="button" layoutId={goalMorphId(goal.goal_uuid)} transition={GOAL_MORPH} data-plan-card={goal.goal_uuid} onClick={onChoose} onPointerEnter={onIntent} onFocus={onIntent} onTouchStart={onIntent}
    aria-label={`Open ${goal.title}, ${percent}% done`} style={{ ...planVars(color), borderRadius: 24 }}
    className="flex w-[86%] shrink-0 snap-center flex-col bg-[var(--plan-deep)] p-5 text-left text-[var(--plan-deep-ink)] opacity-70 shadow-[0_6px_0_var(--plan-deep-edge)] transition-opacity hover:opacity-100 md:w-14 md:px-0 md:py-5 md:opacity-90">
    <Settle className="flex flex-1 flex-col justify-end gap-3 md:items-center md:justify-start">
      <span className="text-xl font-extrabold leading-tight md:hidden">{goal.title}</span>
      <span className="flex items-center gap-3 md:hidden"><GoalProgress percent={percent} label={`${goal.title} progress`} /><span className="text-xs font-bold">{percent}%</span></span>
      <span className="hidden max-h-64 truncate text-sm font-extrabold [writing-mode:vertical-rl] md:block">{goal.title}</span>
    </Settle>
  </motion.button>
}

/**
 * The open goal's header among the learner's other goals. Phones swipe between goals,
 * with neighbours peeking at the edges; wider screens show the others as spines.
 */
export function GoalCarousel({ goals, activeUuid, getGoalColor, choose, onIntent, children }: StripProps & { activeUuid: string; children: React.ReactNode }) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const settle = React.useRef<number | undefined>(undefined)
  const inList = goals.some((goal) => goal.goal_uuid === activeUuid)

  React.useLayoutEffect(() => {
    const box = scroller.current
    const card = box?.querySelector<HTMLElement>(`[data-plan-card="${activeUuid}"]`)
    if (box && card && box.scrollWidth > box.clientWidth) box.scrollLeft = card.offsetLeft - (box.clientWidth - card.clientWidth) / 2
  }, [activeUuid])
  React.useEffect(() => () => window.clearTimeout(settle.current), [])

  if (!inList || goals.length < 2) return <>{children}</>
  // When a swipe comes to rest on another goal, open it.
  const onScroll = () => {
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const box = scroller.current
      if (!box || box.scrollWidth <= box.clientWidth) return
      const middle = box.scrollLeft + box.clientWidth / 2
      const cards = Array.from(box.querySelectorAll<HTMLElement>('[data-plan-card]'))
      const nearest = cards.reduce((best, card) => Math.abs(card.offsetLeft + card.clientWidth / 2 - middle) < Math.abs(best.offsetLeft + best.clientWidth / 2 - middle) ? card : best, cards[0])
      const goal = goals.find((item) => item.goal_uuid === nearest?.dataset.planCard)
      if (goal && goal.goal_uuid !== activeUuid) choose(goal)
    }, 140)
  }
  return <motion.div layoutScroll ref={scroller} onScroll={onScroll} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7%] pb-3 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0 md:pb-1.5">
    {goals.map((goal) => goal.goal_uuid === activeUuid
      ? <div key={goal.goal_uuid} data-plan-card={goal.goal_uuid} className="w-[86%] shrink-0 snap-center md:w-auto md:flex-1">{children}</div>
      : <GoalPeek key={goal.goal_uuid} goal={goal} color={getGoalColor(goal.goal_uuid)} onChoose={() => choose(goal)} onIntent={onIntent ? () => onIntent(goal) : undefined} />)}
  </motion.div>
}
