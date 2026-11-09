'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { Briefcase, CalendarDays, Check, Home, MapPin, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlacePicker } from '@components/LifePlan/PhaseForm'
import type { Phase } from '@services/life/life'
import { ActivityPicker, LivingPicker } from './PhasePickers'
import { activityText, livingLabel } from './setup'
import { mi } from './graph'
import { LengthPicker, lengthText } from './PhaseTime'
import { useHoldDrag, type Env } from './MapParts'

import { tr } from '@/lib/tr'
type Open = 'date' | 'doing' | 'place' | 'living' | null

function Detail({ icon: Icon, set, onClick, children }: { icon: typeof Plus; set: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-extrabold', set ? 'bg-muted' : 'border-2 border-dashed border-border text-muted-foreground hover:text-foreground')}>
    {set ? <Icon size={14} aria-hidden="true" className="shrink-0" /> : <Plus size={14} aria-hidden="true" className="shrink-0" />}<span className="truncate">{children}</span>
  </button>
}

/**
 * A new phase (or a career's route) on the map, waiting to be kept. It starts when the phase before it
 * ends. Nothing is assumed: how long it lasts (it takes no time until picked),
 * what you'd be doing, where and how you'd live are all blank (a career's route brings its steps) and
 * optional, there to fill in before keeping it. Hold it to move it somewhere else.
 */
export function PendingCard({ p, env, token, name, steps, onName, onEdit, onLength, onKeep, onCancel, onLift, onLiftMove, onLiftEnd }: {
  p: Phase; env: Env; token?: string; name: string; steps?: string[]; onName: (v: string) => void; onEdit: (fn: (p: Phase) => void) => void; onLength: (months: number) => void
  onKeep: () => void; onCancel: () => void; onLift: (x: number, y: number) => void; onLiftMove: (x: number, y: number) => void; onLiftEnd: () => void
}) {
  const { holding, ...drag } = useHoldDrag(!env.moving, onLift, onLiftMove, onLiftEnd)
  const [open, setOpen] = React.useState<Open>(null)
  const toggle = (o: Open) => setOpen((v) => (v === o ? null : o))
  const acts = p.activities || []
  return <form data-card={p.id} onSubmit={(e) => { e.preventDefault(); if (!open) onKeep() }} {...drag}
    className={cn('flex min-h-[180px] select-none flex-col gap-3 rounded-[22px] border-[3px] border-dashed border-foreground/60 bg-card p-4 transition-[transform,opacity] [-webkit-touch-callout:none]', holding && 'scale-[.97]', env.held.has(p.id) && 'opacity-35')}>
    <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{steps ? `${steps.length === 1 ? '1 phase' : `${steps.length} phases`}` : tr('goals.pending_card.new_phase', 'New phase')}</span>
    {steps ? <span className="grid gap-1">
      <b className="truncate text-2xl font-extrabold leading-tight">{name}</b>
      <small className="truncate text-sm font-bold text-muted-foreground">{steps.join(' → ')}</small>
    </span> : <input autoFocus aria-label={tr('goals.pending_card.name_of_the_new_phase', 'Name of the new phase')} value={name} onChange={(e) => onName(e.target.value)} placeholder={tr('goals.pending_card.gap_year_trade_school_move', 'Gap year, trade school, move to Portland…')}
      className="h-12 w-full rounded-2xl bg-muted px-3 text-lg font-extrabold outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />}
    <div data-no-drag className="flex flex-wrap gap-1.5">
      {steps ? null : <Detail icon={CalendarDays} set={!p.undated} onClick={() => toggle('date')}>{p.undated ? tr('goals.pending_card.how_long', 'How long?') : lengthText(p.months)}</Detail>}
      {steps ? null : <Detail icon={Briefcase} set={acts.length > 0} onClick={() => toggle('doing')}>{acts.length ? acts.map(activityText).join(' + ') : tr('goals.pending_card.add_activity', 'Add activity')}</Detail>}
      <Detail icon={MapPin} set={!!p.place_label} onClick={() => toggle('place')}>{p.place_label ? p.place_label.split(',')[0] : tr('goals.pending_card.add_location', 'Add location')}</Detail>
      <Detail icon={Home} set={!!p.living} onClick={() => toggle('living')}>{livingLabel(p.living) || tr('goals.pending_card.add_living_situation', 'Add living situation')}</Detail>
    </div>
    {open ? <div data-no-drag className="grid gap-2 rounded-2xl bg-muted/50 p-3">
      {open === 'date' ? <LengthPicker start={mi(p.starts!)} months={p.months || 12} picked={!p.undated} onPick={onLength} /> : null}
      {open === 'doing' ? <>
        {acts.length ? <ul className="grid gap-1.5">{acts.map((a, i) => <li key={i} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm font-bold"><span className="flex-1">{activityText(a)}</span>
          <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => onEdit((q) => { q.activities = (q.activities || []).filter((_, j) => j !== i) })}>{tr('goals.upload.remove', 'Remove')}</button></li>)}</ul> : null}
        <ActivityPicker token={token} onPick={(a) => { onEdit((q) => { q.activities = [...(q.activities || []), a] }); setOpen(null) }} />
      </> : null}
      {open === 'place' ? <PlacePicker token={token} value={p.place || null} label={p.place_label || ''} onPick={(pl) => { onEdit((q) => { q.place = pl?.key || null; q.place_label = pl?.label || ''; q.places = [] }); setOpen(null) }} /> : null}
      {open === 'living' ? <LivingPicker value={p.living} onPick={(key) => { onEdit((q) => { q.living = key }); setOpen(null) }} /> : null}
      <button type="button" onClick={() => setOpen(null)} className="w-fit px-1 text-sm font-bold text-muted-foreground hover:text-foreground">{tr('goals.routine_action.done', 'Done')}</button>
    </div> : null}
    <span className="mt-auto flex items-center justify-between gap-2">
      <small className="text-xs font-bold text-muted-foreground">{tr('goals.pending_card.hold_to_move_it', 'Hold to move it')}</small>
      <span className="flex gap-2">
        <button type="button" onClick={onCancel} aria-label={tr('goals.pending_card.don_t_add_it', 'Don’t add it')} className="grid size-11 place-items-center rounded-full bg-muted text-foreground"><X size={20} aria-hidden="true" /></button>
        <button type="submit" aria-label={tr('goals.routine_action.add_it', 'Add it')} className="grid size-11 place-items-center rounded-full bg-foreground text-background"><Check size={20} aria-hidden="true" /></button>
      </span>
    </span>
  </form>
}
