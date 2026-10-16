'use client'

import React from 'react'
import { Plus, Repeat, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import type { RoutineConfig, Step, StepEntry, StepResult } from '@services/goals/types'
import { shortDate } from '../path/stepText'
import type { ConfigPanelProps, StepActions, StepCardProps, StepDefinition } from './registry'
import { CardNote, Feedback, FinishControls, StepIntro } from './shared'

type RoutineResult = Extract<StepResult, { kind: 'routine' }>

const DEFAULT_STATUSES = ['No reply', 'Replied', 'Interview', 'No']
const resultOf = (step: Step<'routine'>): RoutineResult | null => (step.result?.kind === 'routine' ? step.result : null)
const logs = (step: Step<'routine'>) => step.entries.filter((entry) => entry.kind === 'log' && entry.period_start)
const today = () => new Date().toISOString().slice(0, 10)
const isDue = (entry: StepEntry) => !!entry.follow_up_due && entry.follow_up_due.slice(0, 10) <= today() && !entry.follow_up_status

function endsLine(config: RoutineConfig) {
  const parts = [config.end_date ? `ends ${shortDate(config.end_date)}` : '', config.end_after ? `ends after ${config.end_after}` : ''].filter(Boolean)
  return parts.length ? `Runs until it ${parts.join(' or ')}, or until you end it.` : 'Runs until you end it.'
}

/** Past weeks as bars; tapping one lists what was logged that week. */
// eslint-disable-next-line no-unused-vars
function WeekHistory({ result, selected, onSelect }: { result: RoutineResult; selected: string; onSelect: (start: string) => void }) {
  const most = Math.max(result.target, ...result.weeks.map((week) => week.count))
  return <div className="flex h-16 items-end gap-1.5" role="group" aria-label="Weeks">
    {result.weeks.map((week) => <button key={week.start} type="button" onClick={() => onSelect(week.start)}
      aria-label={`Week of ${shortDate(week.start)}: ${week.count} of ${result.target}`} aria-pressed={week.start === selected}
      className={cn('flex h-full min-w-6 flex-1 flex-col justify-end rounded-md p-0.5', week.start === selected && 'bg-muted')}>
      <span className={cn('block w-full rounded-[4px]', week.count >= result.target ? 'bg-[var(--plan-face)]' : 'bg-[color-mix(in_srgb,var(--plan-face)_45%,transparent)]')}
        style={{ height: `${Math.max(6, (week.count / most) * 100)}%` }} />
    </button>)}
  </div>
}

function FollowUpChoices({ entry, statuses, actions, disabled }: { entry: StepEntry; statuses: string[]; actions: StepActions; disabled: boolean }) {
  return <div className="flex flex-wrap gap-1.5">
    {statuses.map((status) => <button key={status} type="button" disabled={disabled || actions.busy}
      onClick={() => actions.updateEntry(entry.entry_uuid, { follow_up_status: entry.follow_up_status === status ? null : status })}
      className={cn('rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-bold', entry.follow_up_status === status ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_18%,hsl(var(--card)))]' : 'bg-background text-muted-foreground')}>{status}</button>)}
  </div>
}

function LogRow({ entry, statuses, actions, open }: { entry: StepEntry; statuses: string[] | null; actions: StepActions; open: boolean }) {
  return <li className="flex flex-col gap-1.5 rounded-xl border bg-background px-3 py-2 text-sm">
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{entry.title || 'Logged'}</p>
        {entry.note ? <p className="whitespace-pre-wrap text-xs text-foreground/70">{entry.note}</p> : null}
      </div>
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">{shortDate(entry.creation_date)}</span>
      {open ? <button type="button" aria-label="Remove" onClick={() => actions.deleteEntry(entry.entry_uuid)} className="text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
    </div>
    {statuses ? <FollowUpChoices entry={entry} statuses={statuses} actions={actions} disabled={!open} /> : null}
  </li>
}

function RoutineRow({ step }: { step: Step<'routine'> }) {
  const result = resultOf(step)
  if (!result || result.total === 0) return null
  return <div className="mt-1.5 flex h-5 items-end gap-1" aria-hidden="true">
    {result.weeks.map((week) => <span key={week.start} className={cn('w-2.5 rounded-[3px]', week.count >= result.target ? 'bg-[var(--plan-face)]' : 'bg-[color-mix(in_srgb,var(--plan-face)_40%,transparent)]')}
      style={{ height: `${Math.max(15, Math.min(100, (week.count / result.target) * 100))}%` }} />)}
  </div>
}

function RoutineCard({ step, actions, canWork, staff }: StepCardProps<'routine'>) {
  const config = step.config
  const result = resultOf(step)
  const thisWeek = result?.weeks[result.weeks.length - 1]?.start || ''
  const [week, setWeek] = React.useState(thisWeek)
  const [title, setTitle] = React.useState('')
  const [note, setNote] = React.useState('')
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'excused'
  const named = config.entry_kind !== 'count'
  const statuses = config.follow_up ? config.follow_up.statuses : null
  const all = logs(step)
  const due = statuses ? all.filter(isDue) : []
  const shown = all.filter((entry) => entry.period_start?.slice(0, 10) === (week || thisWeek))
  const noun = config.item_label?.trim() || 'one'
  const log = async () => {
    if (named && !title.trim()) return
    await actions.addEntry({ kind: 'log', title: title.trim(), note: note.trim() })
    setTitle('')
    setNote('')
  }
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <Feedback step={step} />
    {result ? <p className="text-sm font-bold">{result.this_week} of {result.target} this week<span className="font-semibold text-muted-foreground"> · {result.total} in all</span></p> : null}
    {open ? named ? <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); log() }}>
      <div className="flex gap-2">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={config.item_label ? `Which ${config.item_label}?` : 'What did you do?'} aria-label="What you did" />
        <button type="submit" disabled={actions.busy || !title.trim()} aria-label="Log it" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 text-[var(--plan-accent)] disabled:opacity-40"><Plus size={16} /></button>
      </div>
      {title.trim() ? <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="A note (optional)" aria-label="Note" /> : null}
    </form> : <Button type="button" variant="plan" className="self-start" disabled={actions.busy} onClick={log}><Plus size={15} aria-hidden="true" />Log {noun}</Button> : null}
    {due.length ? <div className="flex flex-col gap-1.5">
      <p className="text-xs font-extrabold text-[var(--plan-accent)]">Follow up on {due.length}</p>
      <ul className="flex flex-col gap-1.5">{due.map((entry) => <LogRow key={entry.entry_uuid} entry={entry} statuses={statuses} actions={actions} open={open} />)}</ul>
    </div> : null}
    {result && result.total ? <div className="flex flex-col gap-1.5">
      <WeekHistory result={result} selected={week || thisWeek} onSelect={setWeek} />
      <p className="text-xs font-extrabold text-muted-foreground">{(week || thisWeek) === thisWeek ? 'This week' : `Week of ${shortDate(week)}`}</p>
      {shown.length ? <ul className="flex flex-col gap-1.5">{shown.map((entry) => <LogRow key={entry.entry_uuid} entry={entry} statuses={statuses} actions={actions} open={open} />)}</ul>
        : <CardNote>Nothing logged that week.</CardNote>}
    </div> : null}
    {open ? <CardNote>{endsLine(config)}</CardNote> : null}
    <FinishControls step={step} actions={actions} canWork={canWork} staff={staff} finishLabel="End this routine" />
  </div>
}

function RoutineConfigPanel({ config, onChange }: ConfigPanelProps<'routine'>) {
  const set = (patch: Partial<RoutineConfig>) => onChange({ ...config, ...patch })
  const followUp = config.follow_up
  return <div className="grid gap-3 sm:grid-cols-3">
    <div className="flex flex-col gap-1"><Label>Times a week</Label><Input type="number" min={1} max={50} value={config.target || 1} onChange={(event) => set({ target: Math.max(1, Number(event.target.value) || 1) })} /></div>
    <div className="flex flex-col gap-1 sm:col-span-2"><Label>Each one is called</Label><Input value={config.item_label || ''} onChange={(event) => set({ item_label: event.target.value })} placeholder="application" /></div>
    <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3"><input type="checkbox" checked={config.entry_kind !== 'count'} onChange={(event) => set({ entry_kind: event.target.checked ? 'named' : 'count' })} />Each one gets a name and a note</label>
    <div className="flex flex-col gap-1"><Label>End date</Label><Input type="date" value={config.end_date || ''} onChange={(event) => set({ end_date: event.target.value || undefined })} /></div>
    <div className="flex flex-col gap-1"><Label>End after (total)</Label><Input type="number" min={0} value={config.end_after || ''} onChange={(event) => set({ end_after: Number(event.target.value) || undefined })} placeholder="No limit" /></div>
    <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3"><input type="checkbox" checked={!!followUp} onChange={(event) => set({ follow_up: event.target.checked ? { after_days: 7, statuses: DEFAULT_STATUSES } : undefined })} />Follow up on each one</label>
    {followUp ? <>
      <div className="flex flex-col gap-1"><Label>After (days)</Label><Input type="number" min={1} max={90} value={followUp.after_days} onChange={(event) => set({ follow_up: { ...followUp, after_days: Math.max(1, Number(event.target.value) || 1) } })} /></div>
      <div className="flex flex-col gap-1 sm:col-span-2"><Label>Outcomes</Label><Input defaultValue={followUp.statuses.join(', ')} onBlur={(event) => {
        const statuses = event.target.value.split(',').map((item) => item.trim()).filter(Boolean)
        set({ follow_up: { ...followUp, statuses: statuses.length ? statuses : DEFAULT_STATUSES } })
      }} placeholder="No reply, Replied, Interview, No" /></div>
    </> : null}
  </div>
}

export const routine: StepDefinition<'routine'> = {
  type: 'routine',
  label: 'Routine',
  hint: 'Something to do a few times every week',
  icon: Repeat,
  statusLine: (step) => {
    const result = resultOf(step)
    if (!result) return null
    return `${result.this_week} of ${result.target} this week${result.follow_ups_due ? ` · ${result.follow_ups_due} to follow up` : ''}`
  },
  RowResult: RoutineRow,
  CardBody: RoutineCard,
  ConfigPanel: RoutineConfigPanel,
  defaultConfig: () => ({ target: 3, entry_kind: 'named' }),
}
