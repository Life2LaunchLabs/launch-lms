'use client'

import React from 'react'
import { CalendarDays, CalendarPlus, Check, Download, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { calendarEvent, googleCalendarUrl, icsFile } from '@services/goals/calendar'
import type { EventConfig, Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { CardNote, Feedback, FinishControls, StepIntro } from './shared'

const RSVP = [['yes', 'Going'], ['maybe', 'Maybe'], ['no', 'Can’t go']] as const
const today = () => new Date().toLocaleDateString('en-CA')

export function eventWhen(config: EventConfig) {
  if (!config.date) return ''
  const day = new Date(`${config.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = config.start_time ? ` · ${config.start_time.slice(0, 5)}${config.end_time ? `–${config.end_time.slice(0, 5)}` : ''}` : ''
  return `${day}${time}`
}

/** Puts the event on the learner's calendar: Google Calendar, or a file any calendar opens. */
function AddToCalendar({ step }: { step: Step<'event'> }) {
  const event = calendarEvent(step)
  if (!event) return null
  const download = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([icsFile(event)], { type: 'text/calendar' }))
    link.download = `${step.title.replace(/[^\w -]+/g, '').trim() || 'event'}.ics`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" variant="surface" size="sm"><CalendarPlus size={15} aria-hidden="true" />Add to calendar</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem asChild><a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer"><CalendarDays size={14} className="mr-2" />Google Calendar</a></DropdownMenuItem>
      <DropdownMenuItem onSelect={download}><Download size={14} className="mr-2" />Other calendars (.ics)</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

/**
 * Whether they went. Going is the point, so there's no big Mark done: once the day comes the
 * learner says they went; staff confirm it as on any step.
 */
function Attendance({ step, actions, canWork, staff }: StepCardProps<'event'>) {
  if (staff || step.status === 'submitted' || step.completed_by === 'staff') return <FinishControls step={step} actions={actions} canWork={canWork} staff={staff} />
  if (step.status === 'completed') return <CardNote icon={Check}>You went.</CardNote>
  if (!canWork || step.locked || (step.config.date && step.config.date > today())) return null
  return <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
    <span className="text-muted-foreground">Did you go?</span>
    <Button type="button" variant="surface" size="sm" disabled={actions.busy} onClick={() => actions.setStatus('completed')}><Check size={14} aria-hidden="true" />{step.review_required ? 'I went, hand it in' : 'I went'}</Button>
  </div>
}

function EventCard(props: StepCardProps<'event'>) {
  const { step, actions, canWork } = props
  const config = step.config
  const open = canWork && !step.locked && step.status !== 'completed'
  const rsvp = step.submission?.rsvp as string | undefined
  return <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1 text-sm font-semibold">
      {config.date ? <span className="flex items-center gap-1.5"><CalendarDays size={14} className="text-[var(--plan-accent)]" />{eventWhen(config)}</span> : null}
      {config.place ? <span className="flex items-center gap-1.5"><MapPin size={14} className="text-[var(--plan-accent)]" />{config.place}</span> : null}
      {config.url ? <a href={config.url} target="_blank" rel="noreferrer" className="truncate text-[var(--plan-accent)] hover:underline">{config.url}</a> : null}
    </div>
    <StepIntro step={step} />
    <Feedback step={step} />
    {open && (config.rsvp || config.date) ? <div className="flex flex-wrap items-center gap-1.5">
      {config.rsvp ? RSVP.map(([value, label]) => <button key={value} type="button" disabled={actions.busy} aria-pressed={rsvp === value} onClick={() => actions.saveSubmission({ submission: { ...step.submission, rsvp: value } })}
        className={cn('rounded-xl border-2 px-3 py-1.5 text-xs font-extrabold', rsvp === value ? 'border-[var(--plan-face)] bg-[var(--plan-face)] text-[var(--plan-face-ink)]' : 'bg-background')}>{label}</button>) : null}
      {rsvp !== 'no' ? <AddToCalendar step={step} /> : null}
    </div> : null}
    <Attendance {...props} />
  </div>
}

function EventConfigPanel({ config, onChange }: ConfigPanelProps<'event'>) {
  const set = (patch: Partial<EventConfig>) => onChange({ ...config, ...patch })
  return <div className="grid gap-3 sm:grid-cols-3">
    <div className="flex flex-col gap-1"><Label htmlFor="event-date">Date</Label><Input id="event-date" type="date" value={config.date || ''} onChange={(event) => set({ date: event.target.value || undefined })} /></div>
    <div className="flex flex-col gap-1"><Label htmlFor="event-start">Starts</Label><Input id="event-start" type="time" value={(config.start_time || '').slice(0, 5)} onChange={(event) => set({ start_time: event.target.value || undefined })} /></div>
    <div className="flex flex-col gap-1"><Label htmlFor="event-end">Ends</Label><Input id="event-end" type="time" value={(config.end_time || '').slice(0, 5)} onChange={(event) => set({ end_time: event.target.value || undefined })} /></div>
    <div className="flex flex-col gap-1 sm:col-span-3"><Label htmlFor="event-place">Place</Label><Input id="event-place" value={config.place || ''} onChange={(event) => set({ place: event.target.value })} /></div>
    <div className="flex flex-col gap-1 sm:col-span-3"><Label htmlFor="event-link">Link</Label><Input id="event-link" value={config.url || ''} onChange={(event) => set({ url: event.target.value })} placeholder="https://" /></div>
  </div>
}

function EventSettings({ config, onChange }: ConfigPanelProps<'event'>) {
  return <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!config.rsvp} onChange={(event) => onChange({ ...config, rsvp: event.target.checked })} />Ask whether they’re going</label>
}

export const event: StepDefinition<'event'> = {
  type: 'event',
  label: 'Event',
  color: '#C8327D',
  hint: 'Something to go to, added to your calendar',
  icon: CalendarDays,
  statusLine: (step: Step<'event'>) => {
    const when = eventWhen(step.config)
    return when ? `${when}${step.submission?.rsvp === 'yes' ? ' · going' : ''}` : null
  },
  CardBody: EventCard,
  ConfigPanel: EventConfigPanel,
  SettingsPanel: EventSettings,
  defaultConfig: () => ({ rsvp: false }),
}
