'use client'

import React from 'react'
import { Award, CalendarClock, Check, Clock3, Link2, PauseCircle, Play, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { planTone } from './planColors'

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

function stepState(item: StepItem) {
  const status = item.progress?.status || 'not_started'
  if (status === 'completed' || status === 'canceled' || item.availability?.state === 'done') return 'done'
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

type StepStackProps = {
  items: StepItem[]
  // eslint-disable-next-line no-unused-vars
  colorFor: (item: StepItem) => string
  selectedUuid?: string
  // eslint-disable-next-line no-unused-vars
  onSelect: (item: StepItem) => void
  showPlanName?: boolean
  /** What a selected card shows under its header: description, Start, or the not-ready reason. */
  // eslint-disable-next-line no-unused-vars
  renderSelected: (item: StepItem, state: 'open' | 'not_ready' | 'done') => React.ReactNode
}

export function StepStack({ items, colorFor, selectedUuid, onSelect, showPlanName = false, renderSelected }: StepStackProps) {
  return <ol className="flex flex-col">
    {items.map((item, index) => {
      const state = stepState(item)
      const selected = item.objective_uuid === selectedUuid
      const tone = planTone(colorFor(item))
      const meta = stepMeta(item)
      const MetaIcon = meta.icon
      const notReady = state === 'not_ready'
      const done = state === 'done'
      return <li key={item.objective_uuid} id={`step-${item.objective_uuid}`} className="flex items-stretch gap-3 sm:gap-4">
        <div className="flex w-8 shrink-0 flex-col items-center" aria-hidden="true">
          <span className={cn('min-h-3 flex-1 border-l-[3px] border-dashed', index === 0 ? 'border-transparent' : 'border-border')} />
          <span
            className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] bg-card', notReady && 'scale-75 border-muted bg-muted', done && 'border-emerald-100 bg-emerald-600')}
            style={!done && !notReady ? { borderColor: tone.ring, ...(selected ? { backgroundColor: tone.ring, boxShadow: `0 0 0 3px var(--background), 0 0 0 6px ${tone.ring}` } : {}) } : undefined}
          >{done ? <Check size={15} strokeWidth={3.5} className="text-white" /> : null}</span>
          <span className={cn('min-h-3 flex-1 border-l-[3px] border-dashed', index === items.length - 1 ? 'border-transparent' : 'border-border')} />
        </div>
        <div
          className={cn('my-1.5 min-w-0 flex-1 rounded-[22px] p-4 transition-transform sm:p-5', !selected && 'hover:-translate-y-0.5', notReady ? 'bg-muted text-muted-foreground' : 'text-foreground', done && 'opacity-60')}
          style={{
            ...(notReady ? {} : { backgroundColor: tone.tint, boxShadow: `0 4px 0 ${tone.edge}` }),
            ...(selected ? { outline: `3px solid ${notReady ? 'hsl(var(--muted-foreground) / 0.45)' : tone.main}` } : {}),
          }}
        >
          <button type="button" onClick={() => onSelect(item)} aria-expanded={selected} className="flex w-full items-center gap-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 rounded-xl">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              {showPlanName && item.plan ? <span className="inline-flex items-center gap-1.5 text-xs font-black" style={notReady ? undefined : { color: tone.main }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: notReady ? 'currentColor' : tone.ring }} />{item.plan.name}
              </span> : null}
              <span className={cn('text-lg font-black leading-tight sm:text-xl', done && 'line-through decoration-2')}>{item.title}</span>
              <span className={cn('flex items-center gap-2 text-sm font-semibold', notReady ? 'text-muted-foreground' : 'text-foreground/75')}>
                <MetaIcon size={16} aria-hidden="true" />{meta.text}
              </span>
            </span>
            <span className={cn('flex h-[70px] w-[88px] shrink-0 items-center justify-center rounded-2xl', notReady && 'bg-muted-foreground/15')} style={notReady ? undefined : { backgroundColor: item.badge ? '#fff' : tone.ring }}>
              {item.badge?.thumbnail_image
                ? <img src={item.badge.thumbnail_image} alt="" className={cn('badge-sticker-image h-14 w-14 object-contain', notReady && 'opacity-50 grayscale')} />
                : item.badge ? <Award size={34} className={notReady ? 'text-muted-foreground' : ''} style={notReady ? undefined : { color: tone.ring }} />
                : item.activity_id ? <Play size={32} fill="currentColor" className={notReady ? 'text-muted-foreground' : 'text-white'} />
                : <Target size={32} className={notReady ? 'text-muted-foreground' : 'text-white'} />}
            </span>
          </button>
          {selected ? <div className="mt-4 border-t border-foreground/10 pt-4">{renderSelected(item, state)}</div> : null}
        </div>
      </li>
    })}
  </ol>
}

/** The selected card's body: description, then Start or the reason it isn't ready yet. */
// eslint-disable-next-line no-unused-vars
export function SelectedStepBody({ item, state, onStart, onGoTo }: { item: StepItem; state: 'open' | 'not_ready' | 'done'; onStart: () => void; onGoTo: (objectiveUuid: string) => void }) {
  const reason = item.availability?.reason
  return <div className="flex flex-wrap items-center gap-3">
    <p className="min-w-[14rem] flex-1 text-sm leading-6 text-foreground/80">
      {state === 'not_ready' ? `${notReadySentence(item)} ` : null}{item.description || (state === 'done' ? 'You finished this step.' : '')}
    </p>
    {state === 'not_ready' && reason?.kind === 'after'
      ? <button type="button" onClick={() => onGoTo(reason.objective_uuid)} className="min-h-11 rounded-full border-2 border-border bg-card px-4 text-sm font-black hover:bg-muted">Go to {reason.title}</button>
      : null}
    {state !== 'not_ready'
      ? <button type="button" onClick={onStart} className={cn('min-h-[50px] rounded-2xl px-6 text-base font-black transition active:translate-y-[3px]', state === 'done' ? 'border-2 border-border bg-card' : 'bg-[#D7F25C] text-[#111318] shadow-[0_5px_0_#8BA42C] active:shadow-[0_2px_0_#8BA42C]')}>
        {state === 'done' ? 'Review' : item.progress?.status && item.progress.status !== 'not_started' ? 'Continue' : 'Start'}
      </button>
      : null}
  </div>
}
