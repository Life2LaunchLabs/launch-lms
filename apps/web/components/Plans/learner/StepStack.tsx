'use client'

import React from 'react'
import { Award, CalendarClock, Check, Clock3, Link2, Lock, PauseCircle, Play, Sparkles, Star, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { planVars } from './planColors'
import { Button } from '@components/ui/button'

export type StepAvailability = {
  state: 'open' | 'not_ready' | 'done'
  reason?: { kind: 'opens'; date: string } | { kind: 'after'; objective_uuid: string; title: string } | { kind: 'held' } | null
}

export type StepItem = {
  objective_uuid: string
  title: string
  description?: string
  kind?: string
  activity_id?: number | null
  phase_name?: string | null
  display_due_date?: string | null
  due_date?: string | null
  badge?: { name: string; thumbnail_image?: string } | null
  progress?: { status?: string; completed_at?: string | null }
  availability?: StepAvailability
  plan?: { plan_uuid: string; slug: string; name: string }
}

const DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const DAY_YEAR = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function shortDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return (date.getFullYear() === new Date().getFullYear() ? DAY : DAY_YEAR).format(date)
}

export function stepState(item: StepItem): 'open' | 'not_ready' | 'done' {
  const status = item.progress?.status || 'not_started'
  if (status === 'completed' || status === 'submitted' || status === 'canceled' || item.availability?.state === 'done') return 'done'
  if (item.availability?.state === 'not_ready') return 'not_ready'
  return 'open'
}

/** One short line under the title: the reason it isn't ready, its status, or when it's due. */
export function stepMeta(item: StepItem) {
  const reason = item.availability?.reason
  if (stepState(item) === 'not_ready' && reason) {
    if (reason.kind === 'opens') return { icon: CalendarClock, text: `Opens ${shortDate(reason.date)}` }
    if (reason.kind === 'after') return { icon: Link2, text: `After ${reason.title}` }
    return { icon: PauseCircle, text: 'On hold for now' }
  }
  const status = item.progress?.status
  if (status === 'completed') return { icon: Check, text: item.progress?.completed_at ? `Done ${shortDate(item.progress.completed_at)}` : 'Done' }
  if (status === 'submitted') return { icon: Clock3, text: 'Waiting on review' }
  if (status === 'changes_requested') return { icon: Clock3, text: 'Changes requested' }
  // A step's own date (or its chapter's); never the whole plan's target date.
  const due = item.display_due_date !== undefined ? item.display_due_date : item.due_date
  if (due) return { icon: CalendarClock, text: `Due ${shortDate(due)}` }
  if (item.activity_id) return { icon: Play, text: 'Activity' }
  return { icon: item.badge ? Award : Target, text: item.badge ? 'Badge' : item.phase_name || 'Step' }
}

/** The sentence a selected, not-ready step shows. */
export function notReadySentence(item: StepItem) {
  const reason = item.availability?.reason
  if (!reason) return ''
  if (reason.kind === 'opens') return `This opens on ${shortDate(reason.date)}.`
  if (reason.kind === 'after') return `Finish ${reason.title} first, then this opens.`
  return 'Someone helping with this plan has put this step on hold.'
}

type StepState = 'open' | 'not_ready' | 'done'

type StepStackProps = {
  items: StepItem[]
  // eslint-disable-next-line no-unused-vars
  colorFor: (item: StepItem) => string
  selectedUuid?: string
  /** The step the learner should do next; its node breathes. */
  currentUuid?: string
  // eslint-disable-next-line no-unused-vars
  onSelect: (item: StepItem) => void
  showPlanName?: boolean
  /** What the selected step's card shows: description, Start, or the not-ready reason. */
  // eslint-disable-next-line no-unused-vars
  renderSelected: (item: StepItem, state: StepState) => React.ReactNode
}

/** A step on the path: filled when done, bright when open, grey and locked when not ready. */
export function PathNode({ state, current, selected }: { state: StepState; current?: boolean; selected?: boolean }) {
  const open = state === 'open'
  return <span
    aria-hidden="true"
    className={cn(
      'relative z-10 flex shrink-0 items-center justify-center rounded-full transition-transform',
      current ? 'path-node-current h-14 w-14' : 'h-11 w-11',
      state === 'done' && 'bg-[var(--plan-face)] text-[var(--plan-face-ink)] shadow-[0_4px_0_var(--plan-edge)]',
      open && !current && 'border-[3px] border-[var(--plan-face)] bg-card text-[var(--plan-accent)] shadow-[0_4px_0_var(--plan-edge)]',
      open && current && 'bg-[var(--plan-face)] text-[var(--plan-face-ink)]',
      state === 'not_ready' && 'bg-muted text-muted-foreground shadow-[0_4px_0_hsl(var(--edge))]',
      selected && !current && 'scale-110',
    )}
  >
    {state === 'done' ? <Check size={20} strokeWidth={3.5} /> : state === 'not_ready' ? <Lock size={16} strokeWidth={2.5} /> : current ? <Star size={24} strokeWidth={2.5} fill="currentColor" /> : <Play size={16} strokeWidth={3} fill="currentColor" />}
  </span>
}

export function StepStack({ items, colorFor, selectedUuid, currentUuid, onSelect, showPlanName = false, renderSelected }: StepStackProps) {
  return <ol className="flex flex-col">
    {items.map((item, index) => {
      const state = stepState(item)
      const selected = item.objective_uuid === selectedUuid
      const meta = stepMeta(item)
      const MetaIcon = meta.icon
      const last = index === items.length - 1
      return <li key={item.objective_uuid} id={`step-${item.objective_uuid}`} data-objective-shell={item.objective_uuid} data-plan="" style={planVars(colorFor(item))} className="relative flex items-start gap-4 pb-4 scroll-mt-24">
        {!last ? <span aria-hidden="true" className={cn('absolute left-[27px] top-12 bottom-0 w-[3px] -translate-x-1/2 rounded-full', state === 'done' ? 'bg-[var(--plan-face)]/60' : 'bg-border')} /> : null}
        <button type="button" onClick={() => onSelect(item)} aria-label={`${item.title}, ${meta.text}`} aria-expanded={selected} className="flex w-14 shrink-0 justify-center rounded-full pt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          <PathNode state={state} current={item.objective_uuid === currentUuid} selected={selected} />
        </button>
        <div className={cn('min-w-0 flex-1', selected ? 'rounded-2xl border-2 bg-card p-4 shadow-[0_4px_0_hsl(var(--edge))]' : 'pt-2', selected && (state === 'not_ready' ? 'border-border' : 'border-[var(--plan-face)]'))}>
          <button type="button" onClick={() => onSelect(item)} tabIndex={-1} className="flex w-full min-w-0 flex-col items-start gap-0.5 text-left">
            {showPlanName && item.plan ? <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-extrabold text-[var(--plan-accent)]">{item.plan.name}</span> : null}
            <span className={cn('max-w-full font-bold leading-snug', selected ? 'text-lg' : 'truncate text-base', state === 'done' && !selected && 'text-muted-foreground', state === 'not_ready' && 'text-muted-foreground')}>{item.title}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MetaIcon size={13} aria-hidden="true" />{meta.text}</span>
          </button>
          {selected ? <div className="mt-3">{renderSelected(item, state)}</div> : null}
        </div>
      </li>
    })}
  </ol>
}

/** The selected card's body: description, then Start (and Ask Coach) or the reason it isn't ready yet. */
// eslint-disable-next-line no-unused-vars
export function SelectedStepBody({ item, state, onStart, onGoTo, onAsk }: { item: StepItem; state: StepState; onStart: () => void; onGoTo: (objectiveUuid: string) => void; onAsk?: () => void }) {
  const reason = item.availability?.reason
  const text = `${state === 'not_ready' ? `${notReadySentence(item)} ` : ''}${item.description || (item.progress?.status === 'submitted' ? 'Your work is submitted and waiting on review.' : state === 'done' ? 'You finished this step.' : '')}`.trim()
  return <div className="flex flex-col gap-3">
    {text ? <p className="text-sm leading-6 text-foreground/80">{text}</p> : null}
    <div className="flex flex-wrap gap-2">
      {state === 'not_ready' && reason?.kind === 'after'
        ? <Button type="button" variant="surface" onClick={() => onGoTo(reason.objective_uuid)}>Go to {reason.title}</Button>
        : null}
      {state !== 'not_ready'
        ? <Button type="button" onClick={onStart} variant={state === 'done' ? 'surface' : 'plan'} className="min-w-32 flex-1 sm:flex-none">
          {state === 'done' ? 'Review' : item.progress?.status && item.progress.status !== 'not_started' ? 'Continue' : 'Start'}
        </Button>
        : null}
      {onAsk && state !== 'done' ? <Button type="button" variant="surface" onClick={onAsk}><Sparkles size={15} aria-hidden="true" />Ask Coach</Button> : null}
    </div>
  </div>
}
