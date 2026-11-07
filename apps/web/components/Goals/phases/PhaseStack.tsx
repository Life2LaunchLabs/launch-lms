'use client'

import React from 'react'
import Link from 'next/link'
import { BookOpen, Briefcase, Check, GraduationCap, Heart, MapPin, Plane, Plus, Sparkles, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { PHASE_KINDS } from '@components/LifePlan/PhaseForm'
import { phaseTimes, phaseYears, type PhaseTime } from '@components/Goals/learner/phases'
import type { LifeDoc, PlacePhoto } from '@services/life/life'
import PhaseScene from './PhaseScene'
import PhaseCover, { PhotoCredit } from './PhaseCover'

import { tr } from '@/lib/tr'
export const KIND_ICON: Record<string, React.ElementType> = { school: BookOpen, study: GraduationCap, work: Briefcase, gap: Plane, family: Heart, other: Sparkles }
export const kindLabel = (kind: string) => PHASE_KINDS().find(([key]) => key === kind)?.[1] || tr('lit.phase_stack.something_else', 'Something else')

/** The pill at a phase's top left: where the learner is, a phase behind them, or one coming up. */
export function PhaseStatus({ when, className }: { when: PhaseTime['when']; className?: string }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold backdrop-blur'
  if (when === 'now') return <span className={cn(base, 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]', className)}><MapPin size={14} aria-hidden="true" />{tr('goals.phase_stack.you_are_here', 'You are here')}</span>
  if (when === 'done') return <span className={cn(base, 'bg-white/90 text-[#15232c]', className)}><Check size={14} aria-hidden="true" />{tr('goals.routine_action.done', 'Done')}</span>
  return <span className={cn(base, 'bg-white/90 text-[#15232c]', className)}>{when === 'next' ? tr('goals.phase_stack.up_next', 'Up next') : tr('goals.phase_stack.coming_up', 'Coming up')}</span>
}

/** A phase as a picture with its name: what the plans page is made of. */
function PhaseCard({ time, orgslug, goals, photos }: { time: PhaseTime; orgslug: string; goals: number; photos?: Record<string, PlacePhoto> }) {
  const { phase, when } = time
  const Icon = KIND_ICON[phase.kind] || Sparkles
  return <div className="group relative h-[min(calc(100svh-200px),720px)] min-h-[380px] w-full overflow-hidden rounded-[30px] bg-muted text-white shadow-[0_24px_50px_-30px_rgb(10_30_50/0.55)] md:aspect-[16/10] md:h-auto md:min-h-0">
    <PhaseCover phase={phase} photos={photos} past={when === 'done'} className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
    <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(8_20_30/0.18)_0,transparent_22%,transparent_48%,rgb(8_20_30/0.66)_100%)]" aria-hidden="true" />
    {/* The whole card opens the phase; the photo credit sits above the link. */}
    <Link href={getUriWithOrg(orgslug, routePaths.org.phase(phase.id))} aria-label={`${phase.title}${when === 'now' ? ', you are here' : ''}`} className="absolute inset-0 rounded-[30px] focus-visible:outline focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white" />
    <span className="pointer-events-none absolute inset-x-3.5 top-3.5 flex items-start justify-between gap-2">
      <PhaseStatus when={when} />
      {goals ? <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-extrabold text-[#15232c] backdrop-blur"><Target size={14} aria-hidden="true" />{goals === 1 ? tr('goals.goals_workspace.1_goal', '1 goal') : `${goals} goals`}</span> : null}
    </span>
    <span className="pointer-events-none absolute inset-x-5 bottom-5 grid gap-1.5 pr-8 sm:inset-x-6 sm:bottom-6">
      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold opacity-95"><Icon size={15} aria-hidden="true" />{kindLabel(phase.kind)} · {phaseYears(time)}</span>
      <b className="text-[clamp(30px,8vw,52px)] font-extrabold leading-[1.02] tracking-tight [text-shadow:0_2px_20px_rgb(0_0_0/0.25)]">{phase.title}</b>
    </span>
    <PhotoCredit phase={phase} photos={photos} className="bottom-3 right-3" />
  </div>
}

/**
 * The plans page: one picture per phase, past ones above, opening on the one the learner is in,
 * then room for what comes after.
 */
export default function PhaseStack({ doc, orgslug, goalsIn, onAdd, photos }: { doc: LifeDoc; orgslug: string; goalsIn: Record<string, number>; onAdd?: () => void; photos?: Record<string, PlacePhoto> }) {
  const times = phaseTimes(doc)
  const now = React.useRef<HTMLLIElement>(null)
  // Open on the phase they're in, with earlier ones a scroll up.
  React.useLayoutEffect(() => {
    const card = now.current
    if (!card || card === card.parentElement?.firstElementChild) return
    const top = card.getBoundingClientRect().top + window.scrollY - Math.max(16, (window.innerHeight - card.offsetHeight) / 2)
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' as ScrollBehavior })
  }, [])
  return <ol aria-label={tr('goals.phase_stack.the_phases_of_your_plan', 'The phases of your plan')} className="mx-auto grid w-full max-w-[780px] gap-4 md:gap-8">
    {times.map((time) => <li key={time.phase.id} ref={time.when === 'now' ? now : undefined}><PhaseCard time={time} orgslug={orgslug} goals={goalsIn[time.phase.id] || 0} photos={photos} /></li>)}
    {onAdd ? <li><button type="button" onClick={onAdd} className="grid h-56 w-full place-items-center rounded-[30px] text-center text-muted-foreground shadow-[inset_0_0_0_2px_hsl(var(--border))] hover:text-foreground">
      <span className="grid justify-items-center gap-1.5"><Plus size={30} aria-hidden="true" /><b className="text-2xl font-extrabold text-foreground">{tr('goals.phase_page.what_comes_after', 'What comes after?')}</b><small className="text-sm font-bold">{tr('goals.phase_stack.room_to_grow', 'Room to grow')}</small></span>
    </button></li> : null}
  </ol>
}

/** Before there is a plan: one card that starts it with the phase they're in now. */
export function StartPhaseCard({ onStart }: { onStart: () => void }) {
  return <button type="button" onClick={onStart} className="group relative mx-auto block aspect-[16/10] max-h-[440px] w-full max-w-[780px] overflow-hidden rounded-[30px] text-left text-white shadow-[0_24px_50px_-30px_rgb(10_30_50/0.55)]">
    <PhaseScene kind="school" className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
    <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgb(8_20_30/0.66)_100%)]" aria-hidden="true" />
    <span className="absolute inset-x-5 bottom-5 grid gap-2 sm:inset-x-6 sm:bottom-6">
      <b className="text-[clamp(26px,6vw,42px)] font-extrabold leading-tight tracking-tight">{tr('goals.phase_stack.start_with_where_you_are', 'Start with where you are now')}</b>
      <span className="text-sm font-semibold opacity-95">{tr('goals.phase_stack.name_the_phase_you_re', 'Name the phase you’re in, like high school in Eugene. Your goals and a budget go in it.')}</span>
      <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#15232c]"><Plus size={16} aria-hidden="true" />{tr('goals.phase_stack.add_your_first_phase', 'Add your first phase')}</span>
    </span>
  </button>
}
