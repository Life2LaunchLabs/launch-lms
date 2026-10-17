'use client'

import React from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import type { RoutineAction, RoutineActionKind, RoutineCadence, RoutineConfig } from '@services/goals/types'
import { actionText, cadenceText, ordinal, WEEKDAYS } from '@services/goals/routine'
import type { ConfigPanelProps } from './registry'

const chip = (on: boolean) => cn('rounded-full border-[1.5px] px-3 py-1 text-xs font-bold transition', on ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_15%,hsl(var(--card)))]' : 'text-muted-foreground hover:border-[var(--plan-face)]')
const CADENCES: Array<[RoutineCadence, string]> = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]
const KINDS: Array<[RoutineActionKind, string, string]> = [
  ['list', 'Add items', 'A few named things each time, like job openings'],
  ['number', 'Enter a number', 'A value each time, like a weight; a line on the chart'],
  ['check', 'Check it off', 'Just do it, and tick it'],
]

export const DEFAULT_ROUTINE: RoutineConfig = { cadence: 'weekly', days: [0], action: { kind: 'list', target: 1, label: '' } }

/** Older or partial configs read as today's shape, so the editor always has one to work on. */
export function routineConfig(config: Partial<RoutineConfig> | null | undefined): RoutineConfig {
  const cadence = config?.cadence && ['daily', 'weekly', 'monthly'].includes(config.cadence) ? config.cadence : 'weekly'
  const days = Array.isArray(config?.days) ? config.days : DEFAULT_ROUTINE.days
  return { cadence, days, action: { ...DEFAULT_ROUTINE.action, ...(config?.action || {}) } }
}

export function routineProblem(config: RoutineConfig) {
  if (config.cadence !== 'daily' && !config.days.length) return config.cadence === 'weekly' ? 'Pick at least one day of the week' : 'Pick at least one day of the month'
  return null
}

export function cleanRoutine(config: RoutineConfig): RoutineConfig {
  const action: RoutineAction = { kind: config.action.kind, label: (config.action.label || '').trim() }
  if (action.kind === 'list') action.target = Math.max(1, Math.min(50, config.action.target || 1))
  if (action.kind === 'number') {
    action.unit = (config.action.unit || '').trim()
    action.series = [...new Set((config.action.series || []).map((name) => name.trim()).filter(Boolean))]
  }
  return { cadence: config.cadence, days: config.cadence === 'daily' ? [] : config.days, action }
}

export function RoutineConfigPanel({ config: raw, onChange }: ConfigPanelProps<'routine'>) {
  const config = routineConfig(raw)
  const set = (patch: Partial<RoutineConfig>) => onChange({ ...config, ...patch })
  const setAction = (patch: Partial<RoutineAction>) => set({ action: { ...config.action, ...patch } })
  const setCadence = (cadence: RoutineCadence) => {
    if (cadence === config.cadence) return
    set({ cadence, days: cadence === 'weekly' ? [0] : cadence === 'monthly' ? [1] : [] })
  }
  return <div className="flex flex-col gap-4">
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">Repeats</legend>
      <div className="flex flex-wrap gap-1.5">{CADENCES.map(([key, label]) => <button key={key} type="button" aria-pressed={config.cadence === key} className={chip(config.cadence === key)} onClick={() => setCadence(key)}>{label}</button>)}</div>
      {config.cadence === 'weekly' ? <WeekdayPicker days={config.days} onChange={(days) => set({ days })} /> : null}
      {config.cadence === 'monthly' ? <MonthDayPicker days={config.days} onChange={(days) => set({ days })} /> : null}
      <p className="text-xs font-semibold text-muted-foreground">{cadenceText(config)}</p>
    </fieldset>
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">Each time</legend>
      <div className="flex flex-wrap gap-1.5">{KINDS.map(([key, label, hint]) => <button key={key} type="button" title={hint} aria-pressed={config.action.kind === key} className={chip(config.action.kind === key)} onClick={() => { if (key !== config.action.kind) setAction({ kind: key, label: '', unit: '', series: [] }) }}>{label}</button>)}</div>
      {config.action.kind === 'list' ? <div className="grid gap-2 sm:grid-cols-[7rem_1fr]">
        <div className="flex flex-col gap-1"><Label htmlFor="routine-target">How many</Label><Input id="routine-target" type="number" min={1} max={50} value={config.action.target || 1} onChange={(event) => setAction({ target: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="routine-label">Each one is a</Label><Input id="routine-label" value={config.action.label || ''} maxLength={60} onChange={(event) => setAction({ label: event.target.value })} placeholder="job opening" /></div>
      </div> : null}
      {config.action.kind === 'number' ? <>
        <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
          <div className="flex flex-col gap-1"><Label htmlFor="routine-label">What it measures</Label><Input id="routine-label" value={config.action.label || ''} maxLength={60} onChange={(event) => setAction({ label: event.target.value })} placeholder="Weight" /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="routine-unit">Unit</Label><Input id="routine-unit" value={config.action.unit || ''} maxLength={20} onChange={(event) => setAction({ unit: event.target.value })} placeholder="lb" /></div>
        </div>
        <SeriesPicker series={config.action.series || []} onChange={(series) => setAction({ series })} />
      </> : null}
      {config.action.kind === 'check' ? <div className="flex flex-col gap-1"><Label htmlFor="routine-label">What to do (optional)</Label><Input id="routine-label" value={config.action.label || ''} maxLength={60} onChange={(event) => setAction({ label: event.target.value })} placeholder="Stretch for ten minutes" /></div> : null}
      <p className="text-xs font-semibold text-muted-foreground">{actionText(config.action)}</p>
    </fieldset>
  </div>
}

/** S M T W T F S as one split chip; at least one day stays on. */
// eslint-disable-next-line no-unused-vars
function WeekdayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const toggle = (day: number) => {
    const next = days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort((a, b) => a - b)
    if (next.length) onChange(next)
  }
  return <div className="inline-flex self-start overflow-hidden rounded-full border-[1.5px]" role="group" aria-label="Days of the week">
    {WEEKDAYS.map((name, day) => {
      const on = days.includes(day)
      return <button key={name} type="button" aria-pressed={on} aria-label={name} onClick={() => toggle(day)}
        className={cn('h-9 w-9 border-l-[1.5px] text-xs font-extrabold first:border-l-0 sm:w-10', on ? 'bg-[var(--plan-face)] text-[var(--plan-face-ink)]' : 'bg-background text-muted-foreground hover:bg-muted')}>{name[0]}</button>
    })}
  </div>
}

/** A chip per day of the month; tap one to change it, + to add another. */
// eslint-disable-next-line no-unused-vars
function MonthDayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const [editing, setEditing] = React.useState<number | null>(null)
  const pick = (day: number) => {
    const next = editing === null || editing >= days.length ? [...days, day] : days.map((item, index) => (index === editing ? day : item))
    onChange([...new Set(next)].sort((a, b) => a - b))
    setEditing(null)
  }
  const add = () => setEditing(days.length)
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-1.5">
      {days.map((day, index) => <span key={day} className={cn(chip(true), 'inline-flex items-center gap-1 pr-1.5', editing === index && 'ring-2 ring-[var(--plan-face)]/50')}>
        <button type="button" onClick={() => setEditing(editing === index ? null : index)} aria-label={`The ${ordinal(day)}, change it`}>The {ordinal(day)}</button>
        {days.length > 1 ? <button type="button" aria-label={`Remove the ${ordinal(day)}`} onClick={() => onChange(days.filter((item) => item !== day))} className="text-muted-foreground hover:text-foreground"><X size={12} /></button> : null}
      </span>)}
      <button type="button" className={cn(chip(editing === days.length), 'inline-flex items-center gap-1')} onClick={add} aria-label="Add a day of the month"><Plus size={12} aria-hidden="true" />Day</button>
    </div>
    {editing !== null ? <div className="grid w-full max-w-xs grid-cols-7 gap-1 rounded-xl border bg-background p-2" role="group" aria-label="Day of the month">
      {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
        const taken = days.includes(day) && days[editing] !== day
        return <button key={day} type="button" disabled={taken} onClick={() => pick(day)} aria-pressed={days[editing] === day}
          className={cn('h-8 rounded-lg text-xs font-bold disabled:opacity-30', days[editing] === day ? 'bg-[var(--plan-face)] text-[var(--plan-face-ink)]' : 'hover:bg-muted')}>{day}</button>
      })}
    </div> : null}
    {days.some((day) => day > 28) ? <p className="text-xs text-muted-foreground">In shorter months, a day past the end falls on the last day.</p> : null}
  </div>
}

/** Named lines on one chart, such as you and your dog; none means one unnamed line. */
// eslint-disable-next-line no-unused-vars
function SeriesPicker({ series, onChange }: { series: string[]; onChange: (series: string[]) => void }) {
  const [draft, setDraft] = React.useState('')
  const add = () => {
    const names = draft.split(',').map((name) => name.trim()).filter((name) => name && !series.includes(name))
    if (names.length) onChange([...new Set([...series, ...names])].slice(0, 6))
    setDraft('')
  }
  return <div className="flex flex-col gap-1">
    <Label htmlFor="routine-series">Separate lines (optional)</Label>
    <div className="flex flex-wrap items-center gap-1.5">
      {series.map((name) => <span key={name} className={cn(chip(true), 'inline-flex items-center gap-1 pr-1.5')}>{name}
        <button type="button" aria-label={`Remove ${name}`} onClick={() => onChange(series.filter((item) => item !== name))} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
      </span>)}
      {series.length < 6 ? <Input id="routine-series" value={draft} maxLength={40} onChange={(event) => setDraft(event.target.value)} onBlur={add}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }} placeholder={series.length ? 'Another' : 'Me, my dog…'} className="h-8 w-36 text-xs" /> : null}
    </div>
  </div>
}
