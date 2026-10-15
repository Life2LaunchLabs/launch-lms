'use client'

import React from 'react'
import { Check, Plus, SquareCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import type { Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { Feedback, FinishControls, StepIntro } from './shared'

const listOf = (step: Step<'task'>) => step.config.list
const items = (step: Step<'task'>) => step.entries.filter((entry) => entry.kind === 'item')

function TaskRow({ step }: { step: Step<'task'> }) {
  const list = items(step)
  if (!list.length) return null
  return <ul className="mt-1.5 flex flex-wrap gap-1.5">
    {list.slice(0, 4).map((item) => <li key={item.entry_uuid} className="max-w-[14rem] truncate rounded-[10px] border-[1.5px] border-[color-mix(in_srgb,var(--plan-face)_35%,transparent)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))] px-2.5 py-1 text-xs font-extrabold">{item.title || item.url}</li>)}
    {list.length > 4 ? <li className="px-1 py-1 text-xs font-bold text-muted-foreground">+{list.length - 4}</li> : null}
  </ul>
}

function TaskCard({ step, actions, canWork, staff }: StepCardProps<'task'>) {
  const list = listOf(step)
  const entries = items(step)
  const [draft, setDraft] = React.useState('')
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'submitted'
  const add = async () => {
    const value = draft.trim()
    if (!value) return
    await actions.addEntry(list?.item_kind === 'link' ? { kind: 'item', title: value, url: /^https?:\/\//.test(value) ? value : '' } : { kind: 'item', title: value })
    setDraft('')
  }
  const target = list?.target || 0
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <Feedback step={step} />
    {list ? <div className="flex flex-col gap-2">
      <p className="text-xs font-extrabold text-muted-foreground">{list.label || 'Your list'}{target ? ` · ${entries.length} of ${target}` : ''}</p>
      {entries.length ? <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => <li key={entry.entry_uuid} className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm">
          <button type="button" disabled={!open} aria-label={entry.done ? 'Mark not done' : 'Mark done'} onClick={() => actions.updateEntry(entry.entry_uuid, { done: !entry.done })} className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border-2', entry.done ? 'border-[var(--plan-face)] bg-[var(--plan-face)] text-[var(--plan-face-ink)]' : 'border-border')}>{entry.done ? <Check size={12} strokeWidth={3.5} /> : null}</button>
          {entry.url ? <a href={entry.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold underline-offset-2 hover:underline">{entry.title || entry.url}</a> : <span className="min-w-0 flex-1 truncate font-semibold">{entry.title}</span>}
          {open ? <button type="button" aria-label="Remove" onClick={() => actions.deleteEntry(entry.entry_uuid)} className="text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
        </li>)}
      </ul> : null}
      {open ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); add() }}>
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={list.item_kind === 'link' ? 'Paste a link' : 'Add an item'} />
        <button type="submit" disabled={actions.busy || !draft.trim()} aria-label="Add" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 text-[var(--plan-accent)] disabled:opacity-40"><Plus size={16} /></button>
      </form> : null}
    </div> : null}
    <FinishControls step={step} actions={actions} canWork={canWork} staff={staff} blocker={target && entries.length < target ? `Add ${target - entries.length} more first` : null} />
  </div>
}

function TaskConfigPanel({ config, onChange }: ConfigPanelProps<'task'>) {
  const list = config.list
  return <div className="flex flex-col gap-3">
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={!!list} onChange={(event) => onChange(event.target.checked ? { list: { label: '', target: 0, item_kind: 'text' } } : {})} />
      The learner keeps a list
    </label>
    {list ? <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1 sm:col-span-2"><Label>List label</Label><Input value={list.label || ''} onChange={(event) => onChange({ list: { ...list, label: event.target.value } })} placeholder="People I talked to" /></div>
      <div className="flex flex-col gap-1"><Label>How many</Label><Input type="number" min={0} max={100} value={list.target || 0} onChange={(event) => onChange({ list: { ...list, target: Number(event.target.value) || 0 } })} /></div>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3"><input type="checkbox" checked={list.item_kind === 'link'} onChange={(event) => onChange({ list: { ...list, item_kind: event.target.checked ? 'link' : 'text' } })} />Each item is a link</label>
    </div> : null}
  </div>
}

export const task: StepDefinition<'task'> = {
  type: 'task',
  label: 'Task',
  hint: 'Something to do, with an optional list to fill',
  icon: SquareCheck,
  statusLine: (step) => {
    const target = listOf(step)?.target
    return target ? `${items(step).length} of ${target}` : null
  },
  RowResult: TaskRow,
  CardBody: TaskCard,
  ConfigPanel: TaskConfigPanel,
  defaultConfig: () => ({}),
}
