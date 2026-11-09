'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Route, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LifeDoc, Phase } from '@services/life/life'
import { MonthPicker } from './PhasePickers'
import { below, byId, detours, endOf, lenOf, mi, monthText, parents, wayOf, ym } from './graph'
import { setShown, useShown } from './way'

import { tr } from '@/lib/tr'

/** "6 mo", "1 yr", "2 yrs 3 mo". */
export function lengthText(months: number): string {
  const y = Math.floor(months / 12), m = months % 12
  const ys = y ? (y === 1 ? tr('goals.phase_time.one_year', '1 yr') : tr('goals.phase_time.years', '{{n}} yrs', { n: y })) : ''
  const ms = m ? tr('goals.phase_time.months', '{{n}} mo', { n: m }) : ''
  return [ys, ms].filter(Boolean).join(' ') || tr('goals.phase_time.months', '{{n}} mo', { n: 0 })
}

/** A phase's dates on a card: "Sep 2027 – Jun 2028", or when it starts and a nudge when its length isn't picked. */
export function spanText(doc: LifeDoc, p: Phase): string {
  return p.undated ? tr('goals.phase_time.from_how_long', 'From {{month}} · how long?', { month: monthText(p.starts!) }) : `${monthText(p.starts!)} – ${monthText(endOf(doc, p))}`
}

/**
 * When the dates on screen aren't the learner's first choices: which options they follow, and a way
 * back. Nothing shows while they're looking at their first choices.
 */
export function WayBar({ doc, className }: { doc: LifeDoc | null | undefined; className?: string }) {
  useTranslation()
  const shown = useShown()
  const off = doc?.phases?.length ? detours(doc, shown) : []
  if (!off.length) return null
  return <div role="status" className={cn('flex flex-wrap items-center gap-1.5 rounded-2xl bg-amber-100 px-3 py-2 text-[13px] font-bold text-amber-950 dark:bg-amber-500/15 dark:text-amber-100', className)}>
    <Route size={15} aria-hidden="true" className="shrink-0" />
    <span>{tr('goals.phase_time.dates_with', 'Dates with')}</span>
    {off.map((d) => <span key={d.key} className="rounded-full bg-white/70 px-2.5 py-0.5 font-extrabold dark:bg-white/10">{d.title}</span>)}
    <button type="button" onClick={() => setShown({})} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-extrabold underline-offset-2 hover:underline">
      <Undo2 size={14} aria-hidden="true" />{tr('goals.phase_time.back_to_first_choices', 'Back to my first choices')}
    </button>
  </div>
}

const LENGTHS = [6, 12, 24, 48]

/** Quick lengths, then the month it ends. */
export function LengthPicker({ start, months, picked, disabled, onPick }: { start: number; months: number; picked: boolean; disabled?: boolean; onPick: (months: number) => void }) {
  useTranslation()
  const end = start + Math.max(1, months)
  return <div className="grid gap-3">
    <div className="flex flex-wrap gap-1.5">
      {LENGTHS.map((m) => <button key={m} type="button" disabled={disabled} aria-pressed={picked && months === m} onClick={() => onPick(m)}
        className={cn('rounded-full px-3.5 py-1.5 text-sm font-extrabold shadow-[0_0_0_1.5px_hsl(var(--border))] disabled:opacity-50', picked && months === m ? 'bg-foreground text-background shadow-none' : 'bg-card')}>{lengthText(m)}</button>)}
    </div>
    <div className="grid gap-1">
      <span className="text-sm font-bold text-muted-foreground">{tr('goals.phase_time.ends', 'Ends')}</span>
      {disabled ? <span className="font-extrabold">{monthText(end)}</span>
        : <MonthPicker value={ym(end)} onChange={(v) => { const m = mi(v) - start; if (m >= 1) onPick(m) }} />}
    </div>
  </div>
}

/**
 * When a phase starts and ends. Its start is the month the phase before it ends (on the way being
 * looked at), so changing it changes that one too; changing its end moves everything after it.
 */
export function TimeEditor({ doc, phase, fixed, onLength, onStart }: { doc: LifeDoc; phase: Phase; fixed: 'start' | 'all' | null; onLength: (months: number) => void; onStart: (month: number) => void }) {
  useTranslation()
  const start = mi(phase.starts!), on = wayOf(doc)
  const back = (x: Phase) => parents(doc, x).find((q) => on.has(q.id)) || parents(doc, x)[0]
  let before = back(phase)
  for (let n = 0; before?.pass && n < 50; n++) before = back(before)
  const after = [...below(doc, phase.id)].map((id) => byId(doc, id)).filter((q) => q && on.has(q.id)).length
  const months = lenOf(phase) || Math.max(1, phase.months || 12)
  return <div className="grid gap-4">
    <div className="grid gap-1">
      <span className="text-sm font-bold text-muted-foreground">{fixed ? tr('goals.phase_page.started', 'Started') : tr('goals.phase_time.starts', 'Starts')}</span>
      {fixed ? <span className="font-extrabold">{monthText(start)}</span> : <MonthPicker value={phase.starts!} onChange={(v) => onStart(mi(v))} />}
      {!fixed ? <small className="text-xs font-semibold text-muted-foreground">{before
        ? tr('goals.phase_time.same_month_before_ends', 'The same month {{title}} ends, so changing it changes that too.', { title: before.title })
        : tr('goals.phase_time.your_plan_starts_here', 'Your plan starts here.')}</small> : null}
    </div>
    <div className="grid gap-1">
      <span className="text-sm font-bold text-muted-foreground">{phase.undated ? tr('goals.phase_time.how_long', 'How long?') : tr('goals.phase_time.lasts', 'Lasts {{length}}', { length: lengthText(months) })}</span>
      <LengthPicker start={start} months={months} picked={!phase.undated} disabled={fixed === 'all'} onPick={onLength} />
    </div>
    {fixed !== 'all' ? <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onLength(months + 12)} className="rounded-full bg-muted px-3.5 py-1.5 text-sm font-extrabold hover:bg-muted/70">{tr('goals.phase_time.a_year_longer', 'A year longer')}</button>
      {after ? <small className="text-xs font-semibold text-muted-foreground">{after === 1 ? tr('goals.phase_time.one_later_moves', 'The phase after it moves with its end.') : tr('goals.phase_time.later_move', 'The {{n}} phases after it move with its end.', { n: after })}</small> : null}
    </div> : null}
  </div>
}
