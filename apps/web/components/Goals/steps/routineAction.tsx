'use client'

import React from 'react'
import { Check, Plus, Undo2, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import type { RoutineAction, Step, StepEntry } from '@services/goals/types'
import type { StepActions } from './registry'

type Props = {
  step: Step<'routine'>
  action: RoutineAction
  /** The time being filled in; logged for an earlier one only when it isn't the current. */
  period: string
  current: string
  actions: StepActions
  open: boolean
}

/** The logs that count toward a time: stamped with any day from its start up to the next time's
 * (as the API counts them), so logs from before a cadence change still show. */
export function logsFor(step: Step<'routine'>, period: string) {
  const starts = (step.result?.kind === 'routine' ? step.result.periods.map((item) => item.start) : [period]).sort()
  const next = starts.find((start) => start > period)
  return step.entries.filter((entry) => {
    const day = entry.period_start?.slice(0, 10)
    return entry.kind === 'log' && !!day && day >= period && (!next || day < next)
  })
}

/** What the routine asks for, for one time it came round, worked on in place. */
export function RoutineActionInput(props: Props) {
  if (props.action.kind === 'number') return <NumberAction {...props} />
  if (props.action.kind === 'check') return <CheckAction {...props} />
  return <ListAction {...props} />
}

const periodOf = (period: string, current: string) => (period === current ? {} : { period })

function ListAction({ step, action, period, current, actions, open }: Props) {
  const [title, setTitle] = React.useState('')
  const [note, setNote] = React.useState('')
  const items = logsFor(step, period)
  const label = (action.label || '').trim()
  const add = async () => {
    if (!title.trim()) return
    if (await actions.addEntry({ kind: 'log', title: title.trim(), note: note.trim(), ...periodOf(period, current) })) {
      setTitle('')
      setNote('')
    }
  }
  return <div className="flex flex-col gap-1.5">
    {items.length ? <ul className="flex flex-col gap-1.5">{items.map((entry) => <ListItem key={entry.entry_uuid} entry={entry} actions={actions} open={open} />)}</ul> : null}
    {open ? <form className="flex flex-col gap-1.5 rounded-xl border-2 border-dashed bg-background p-2" onSubmit={(event) => { event.preventDefault(); void add() }}>
      <div className="flex items-center gap-2">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={label ? `Add a ${label}` : 'Add one'} aria-label={label ? `Add a ${label}` : 'Add one'} className="border-0 bg-transparent shadow-none focus-visible:ring-0" />
        <button type="submit" disabled={actions.busy || !title.trim()} aria-label="Add it" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--plan-face)] text-[var(--plan-face-ink)] disabled:opacity-40"><Plus size={16} /></button>
      </div>
      {title.trim() ? <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Details (optional)" aria-label="Details" className="h-8 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0" /> : null}
    </form> : null}
  </div>
}

function ListItem({ entry, actions, open }: { entry: StepEntry; actions: StepActions; open: boolean }) {
  return <li className="flex items-start gap-2 rounded-xl border bg-background px-3 py-2 text-sm">
    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--plan-face)] text-[var(--plan-face-ink)]"><Check size={12} strokeWidth={3.5} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1">
      <p className="truncate font-bold">{entry.title || 'Added'}</p>
      {entry.note ? <p className="whitespace-pre-wrap text-xs text-muted-foreground">{entry.note}</p> : null}
    </div>
    {open ? <button type="button" aria-label={`Remove ${entry.title || 'this'}`} disabled={actions.busy} onClick={() => actions.deleteEntry(entry.entry_uuid)} className="text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
  </li>
}

function NumberAction({ step, action, period, current, actions, open }: Props) {
  const series = action.series?.length ? action.series : ['']
  const logged = logsFor(step, period)
  return <div className="flex flex-col gap-1.5">
    {series.map((name) => <NumberRow key={`${period}-${name}`} name={name} label={name || action.label || 'Value'} unit={action.unit || ''}
      entry={logged.find((entry) => String(entry.data?.series || '') === name)} period={period} current={current} actions={actions} open={open} />)}
  </div>
}

function NumberRow({ name, label, unit, entry, period, current, actions, open }: { name: string; label: string; unit: string; entry?: StepEntry; period: string; current: string; actions: StepActions; open: boolean }) {
  const saved = entry && typeof entry.data?.value === 'number' ? String(entry.data.value) : ''
  const [value, setValue] = React.useState(saved)
  // Enter then blur shouldn't log the same value twice.
  const saving = React.useRef(false)
  React.useEffect(() => setValue(saved), [saved])
  const save = async () => {
    const number = Number(value)
    if (saving.current || value.trim() === '' || Number.isNaN(number) || value === saved) return
    saving.current = true
    try {
      if (entry) await actions.updateEntry(entry.entry_uuid, { data: { value: number } })
      else await actions.addEntry({ kind: 'log', title: '', data: { value: number, series: name }, ...periodOf(period, current) })
    } finally {
      saving.current = false
    }
  }
  return <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <label htmlFor={`value-${period}-${name}`} className="min-w-0 flex-1 truncate text-sm font-bold">{label}</label>
    <div className="flex items-center gap-1.5">
      <Input id={`value-${period}-${name}`} type="number" inputMode="decimal" step="any" value={value} disabled={!open} onChange={(event) => setValue(event.target.value)} onBlur={() => void save()} className="h-9 w-28 text-right" />
      {unit ? <span className="w-8 text-xs font-semibold text-muted-foreground">{unit}</span> : null}
      {entry ? <Check size={16} className="text-[var(--plan-accent)]" aria-label="Logged" /> : <span className="w-4" />}
    </div>
  </form>
}

function CheckAction({ step, period, current, actions, open }: Props) {
  const done = logsFor(step, period)[0]
  if (done) return <div className="flex items-center gap-2">
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-[color-mix(in_srgb,var(--plan-face)_18%,hsl(var(--card)))] px-3 py-2 text-sm font-bold"><Check size={15} aria-hidden="true" />Done</span>
    {open ? <Button type="button" variant="ghost" size="sm" disabled={actions.busy} onClick={() => actions.deleteEntry(done.entry_uuid)}><Undo2 size={14} aria-hidden="true" />Undo</Button> : null}
  </div>
  return open ? <Button type="button" variant="plan" className="self-start" disabled={actions.busy} onClick={() => actions.addEntry({ kind: 'log', title: '', ...periodOf(period, current) })}>
    <Check size={15} aria-hidden="true" />Mark done
  </Button> : null
}
