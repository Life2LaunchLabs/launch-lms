'use client'

import React from 'react'
import { CalendarDays, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import type { EventConfig, Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { Feedback, FinishControls, StepIntro } from './shared'

const RSVP = [['yes', 'Going'], ['maybe', 'Maybe'], ['no', 'Can’t go']] as const

export function eventWhen(config: EventConfig) {
  if (!config.date) return ''
  const day = new Date(`${config.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = config.start_time ? ` · ${config.start_time.slice(0, 5)}${config.end_time ? `–${config.end_time.slice(0, 5)}` : ''}` : ''
  return `${day}${time}`
}

function EventCard({ step, actions, canWork, staff }: StepCardProps<'event'>) {
  const config = step.config
  const saved = String(step.submission?.reflection || '')
  const [reflection, setReflection] = React.useState(saved)
  React.useEffect(() => setReflection(saved), [saved])
  const open = canWork && !step.locked && step.status !== 'completed'
  const rsvp = step.submission?.rsvp as string | undefined
  const save = (patch: Record<string, unknown>) => actions.saveSubmission({ submission: { ...step.submission, ...patch } })
  return <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1 text-sm font-semibold">
      {config.date ? <span className="flex items-center gap-1.5"><CalendarDays size={14} className="text-[var(--plan-accent)]" />{eventWhen(config)}</span> : null}
      {config.place ? <span className="flex items-center gap-1.5"><MapPin size={14} className="text-[var(--plan-accent)]" />{config.place}</span> : null}
      {config.url ? <a href={config.url} target="_blank" rel="noreferrer" className="truncate text-[var(--plan-accent)] hover:underline">{config.url}</a> : null}
    </div>
    <StepIntro step={step} />
    <Feedback step={step} />
    {config.rsvp && open ? <div className="flex gap-1.5">
      {RSVP.map(([value, label]) => <button key={value} type="button" disabled={actions.busy} onClick={() => save({ rsvp: value })} className={cn('rounded-xl border-2 px-3 py-1.5 text-xs font-extrabold', rsvp === value ? 'border-[var(--plan-face)] bg-[var(--plan-face)] text-[var(--plan-face-ink)]' : 'bg-background')}>{label}</button>)}
    </div> : null}
    {config.reflection_prompt ? <div className="flex flex-col gap-1.5">
      <p className="text-sm font-bold">{config.reflection_prompt}</p>
      {open ? <Textarea rows={3} value={reflection} onChange={(event) => setReflection(event.target.value)} onBlur={() => { if (reflection !== saved) save({ reflection }) }} /> : saved ? <p className="whitespace-pre-wrap text-sm text-foreground/80">{saved}</p> : null}
    </div> : null}
    <FinishControls step={step} actions={actions} canWork={canWork} staff={staff} />
  </div>
}

function EventConfigPanel({ config, onChange }: ConfigPanelProps<'event'>) {
  const set = (patch: Partial<EventConfig>) => onChange({ ...config, ...patch })
  return <div className="grid gap-3 sm:grid-cols-3">
    <div className="flex flex-col gap-1"><Label>Date</Label><Input type="date" value={config.date || ''} onChange={(event) => set({ date: event.target.value || undefined })} /></div>
    <div className="flex flex-col gap-1"><Label>Starts</Label><Input type="time" value={(config.start_time || '').slice(0, 5)} onChange={(event) => set({ start_time: event.target.value || undefined })} /></div>
    <div className="flex flex-col gap-1"><Label>Ends</Label><Input type="time" value={(config.end_time || '').slice(0, 5)} onChange={(event) => set({ end_time: event.target.value || undefined })} /></div>
    <div className="flex flex-col gap-1 sm:col-span-3"><Label>Place</Label><Input value={config.place || ''} onChange={(event) => set({ place: event.target.value })} /></div>
    <div className="flex flex-col gap-1 sm:col-span-3"><Label>Link</Label><Input value={config.url || ''} onChange={(event) => set({ url: event.target.value })} placeholder="https://" /></div>
    <div className="flex flex-col gap-1 sm:col-span-3"><Label>Reflection afterwards</Label><Input value={config.reflection_prompt || ''} onChange={(event) => set({ reflection_prompt: event.target.value })} placeholder="What did you take away?" /></div>
    <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3"><input type="checkbox" checked={!!config.rsvp} onChange={(event) => set({ rsvp: event.target.checked })} />Ask whether they’re going</label>
  </div>
}

export const event: StepDefinition<'event'> = {
  type: 'event',
  label: 'Event',
  hint: 'Show up to something; done when attended',
  icon: CalendarDays,
  statusLine: (step: Step<'event'>) => {
    const when = eventWhen(step.config)
    return when ? `${when}${step.submission?.rsvp === 'yes' ? ' · going' : ''}` : null
  },
  CardBody: EventCard,
  ConfigPanel: EventConfigPanel,
  defaultConfig: () => ({ rsvp: false }),
}
