'use client'

import React from 'react'
import { ArrowUpRight, Check, Eye, Library, NotebookPen, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { ResourcePickerModal } from '@components/Resources/admin/ResourcePicker'
import { getResourceTypePresentation } from '@components/Resources/ResourceTypeVisual'
import type { ResourceType } from '@services/resources/resources'
import type { Step, StepEntry, StepResourceCard } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { AskCoach, CardNote, Feedback, FinishControls, StepIntro } from './shared'

const MAX = 8
// eslint-disable-next-line no-unused-vars
type SaveNote = (text: string) => Promise<boolean>

/** The step's resources, with their links when the server sent them (a template preview has only titles). */
function cardsOf(step: Step<'resources'>): StepResourceCard[] {
  const known = new Map((step.reference?.resources || []).map((item) => [item.resource_uuid, item]))
  return (step.config.resources || []).map((item) => known.get(item.resource_uuid) || { resource_uuid: item.resource_uuid, title: item.title || 'Resource', url: '' })
}

const visitOf = (step: Step<'resources'>, uuid: string): StepEntry | undefined => step.entries.find((entry) => entry.kind === 'resource' && entry.resource_uuid === uuid)
const opensOf = (entry?: StepEntry) => Number(entry?.data?.opens || 0)
const openedCount = (step: Step<'resources'>) => (step.config.resources || []).filter((item) => opensOf(visitOf(step, item.resource_uuid)) > 0).length
const neededOf = (step: Pick<Step<'resources'>, 'config'>) => {
  const total = step.config.resources?.length || 0
  return step.config.required ? Math.min(step.config.required, total) : total
}

const day = (stamp: unknown) => {
  if (typeof stamp !== 'string' || !stamp) return ''
  const date = new Date(stamp)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ResourcesRow({ step }: { step: Step<'resources'> }) {
  const result = step.result?.kind === 'resources' ? step.result : null
  if (!result) return null
  const chip = 'rounded-[10px] border-[1.5px] border-[color-mix(in_srgb,var(--plan-face)_35%,transparent)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))] px-2.5 py-1 text-xs font-extrabold'
  return <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
    <span className={cn(chip, 'inline-flex items-center gap-1')}><Eye size={13} aria-hidden="true" className="text-[var(--plan-accent)]" />{result.opened} of {result.total} opened</span>
    {result.notes ? <span className={cn(chip, 'inline-flex items-center gap-1')}><NotebookPen size={13} aria-hidden="true" className="text-[var(--plan-accent)]" />{result.notes} {result.notes === 1 ? 'note' : 'notes'}</span> : null}
  </div>
}

/** The learner's note on one resource: a quiet link until they write one, saved when they're done typing. */
function ResourceNote({ entry, editable, onSave }: { entry?: StepEntry; editable: boolean; onSave: SaveNote }) {
  const saved = entry?.note || ''
  const [editing, setEditing] = React.useState(false)
  const [text, setText] = React.useState(saved)
  React.useEffect(() => { if (!editing) setText(saved) }, [saved, editing])
  if (!editable) return saved ? <p className="whitespace-pre-wrap rounded-xl border-l-4 border-[var(--plan-face)] bg-background px-3 py-2 text-sm leading-6 text-foreground/80">{saved}</p> : null
  if (!editing) return saved ? <button type="button" onClick={() => setEditing(true)} className="w-full whitespace-pre-wrap rounded-xl border-l-4 border-[var(--plan-face)] bg-background px-3 py-2 text-left text-sm leading-6 text-foreground/80 hover:bg-muted">{saved}</button>
    : <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 self-start text-xs font-bold text-muted-foreground hover:text-foreground"><NotebookPen size={13} aria-hidden="true" />Add a note on this</button>
  const save = async () => {
    if (text.trim() === saved.trim() || await onSave(text)) setEditing(false)
  }
  return <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <Textarea autoFocus rows={2} maxLength={10000} value={text} onChange={(event) => setText(event.target.value)} placeholder="What stood out? What will you do with it?" />
    <div className="flex gap-2">
      <Button type="submit" variant="plan" size="sm">Save note</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => { setText(saved); setEditing(false) }}>Cancel</Button>
    </div>
  </form>
}

function ResourceItem({ card, entry, learner, canOpen, staff, onOpen, onNote }: {
  card: StepResourceCard; entry?: StepEntry; learner: boolean; canOpen: boolean; staff: boolean; onOpen: () => void; onNote: SaveNote
}) {
  const type = (card.resource_type || 'other') as ResourceType
  const { icon: Icon, color } = getResourceTypePresentation(type)
  const opens = opensOf(entry)
  const meta = [card.provider_name, card.estimated_time ? `${card.estimated_time} min` : null].filter(Boolean).join(' · ')
  const seen = opens ? staff ? `Opened ${opens === 1 ? 'once' : `${opens} times`}${day(entry?.data?.last_opened_at) ? `, last ${day(entry?.data?.last_opened_at)}` : ''}` : 'Opened' : staff ? 'Not opened yet' : ''
  return <li className="flex flex-col gap-2 rounded-2xl border-2 bg-background p-2.5 sm:p-3">
    <div className="flex items-center gap-2.5 sm:gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white sm:h-11 sm:w-11" style={{ background: color }} aria-hidden="true"><Icon size={19} /></span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-bold leading-snug">{card.title}</p>
        <p className={cn('flex min-w-0 items-center gap-1 text-xs font-semibold [&>span]:truncate', opens ? 'text-[var(--plan-accent)]' : 'text-muted-foreground')}>
          {opens ? <Check size={13} strokeWidth={3} aria-hidden="true" className="shrink-0" /> : null}<span>{[seen, meta].filter(Boolean).join(' · ') || (card.missing ? 'No longer in the library' : '')}</span>
        </p>
      </div>
      {card.url && canOpen ? <Button type="button" variant={opens || staff ? 'surface' : 'plan'} size="sm" onClick={onOpen} aria-label={`Open ${card.title}`}>
        <span className="hidden sm:inline">Open</span><ArrowUpRight size={15} aria-hidden="true" />
      </Button> : null}
    </div>
    {card.description && !opens && learner ? <p className="line-clamp-2 text-[13px] leading-5 text-foreground/70">{card.description}</p> : null}
    {learner && (opens || entry?.note) ? <ResourceNote entry={entry} editable onSave={onNote} /> : null}
    {!learner && entry?.note ? <ResourceNote entry={entry} editable={false} onSave={onNote} /> : null}
  </li>
}

function finishLine(left: number, need: number, total: number) {
  if (!left) return 'All set.'
  if (left === total) return total === 1 ? 'Open it to finish this step.' : 'Open each one to finish this step.'
  if (left === need) return `Open any ${need} to finish this step.`
  return `Open ${left} more to finish this step.`
}

function ResourcesCard({ goal, step, actions, canWork, staff, viewerUserId }: StepCardProps<'resources'>) {
  const cards = cardsOf(step)
  // Only the learner's own opens count; someone helping can open a link to check it without changing anything.
  const learner = !staff && canWork && !step.locked && (!viewerUserId || !goal.subject || goal.subject.id === viewerUserId)
  const done = step.status === 'completed' || step.status === 'excused' || step.status === 'submitted'
  const need = neededOf(step)
  const left = Math.max(0, need - openedCount(step))
  const open = (card: StepResourceCard) => {
    window.open(card.url, '_blank', 'noopener,noreferrer')
    // Recording the open never stands in the way of opening it.
    if (learner && actions.visitResource) void actions.visitResource(card.resource_uuid, { opened: true })
  }
  const note = (card: StepResourceCard) => (text: string) => actions.visitResource ? actions.visitResource(card.resource_uuid, { note: text }) : Promise.resolve(false)
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <Feedback step={step} />
    <ul className="flex flex-col gap-2">
      {cards.map((card) => <ResourceItem key={card.resource_uuid} card={card} entry={visitOf(step, card.resource_uuid)} learner={learner} staff={staff}
        canOpen={!step.locked} onOpen={() => open(card)} onNote={note(card)} />)}
    </ul>
    {learner && !done ? <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <CardNote icon={Eye}>{step.completed_by === 'staff' ? 'People helping with this goal see what you open and your notes, and mark this done.' : `${finishLine(left, need, cards.length)} People helping with this goal can see what you open and your notes.`}</CardNote>
      {actions.ask ? <span className="ml-auto"><AskCoach onAsk={actions.ask} /></span> : null}
    </div> : null}
    {staff ? <FinishControls step={step} actions={actions} canWork={canWork} staff={staff} /> : null}
  </div>
}

/** Resources › what to check out and how many finish it. */
function ResourcesConfigPanel({ config, onChange }: ConfigPanelProps<'resources'>) {
  const [picking, setPicking] = React.useState(false)
  const picked = config.resources || []
  const required = config.required || 0
  return <div className="flex flex-col gap-2">
    <Label>Resources to check out</Label>
    {picked.length ? <ul className="flex flex-wrap gap-1.5">{picked.map((item) => <li key={item.resource_uuid} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-[13px] font-semibold">
      <Library size={13} aria-hidden="true" className="shrink-0 text-muted-foreground" /><span className="truncate">{item.title || 'Resource'}</span>
      <button type="button" aria-label={`Remove ${item.title || 'resource'}`} onClick={() => {
        const rest = picked.filter((other) => other.resource_uuid !== item.resource_uuid)
        onChange({ ...config, resources: rest, required: Math.min(required, rest.length) || undefined })
      }} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={13} /></button>
    </li>)}</ul> : <p className="text-xs text-muted-foreground">Pick one to {MAX} resources for them to open.</p>}
    {picked.length < MAX ? <button type="button" onClick={() => setPicking(true)} className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold hover:bg-muted"><Plus size={14} aria-hidden="true" />Add resources</button> : null}
    {picked.length > 1 ? <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Done when they open
      <select value={required} onChange={(event) => onChange({ ...config, required: Number(event.target.value) || undefined })} className="h-8 rounded-md border bg-background px-2 text-sm">
        <option value={0}>all of them</option>
        {Array.from({ length: picked.length - 1 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>any {count}</option>)}
      </select>
    </label> : null}
    <p className="text-xs text-muted-foreground">If the learner finishes this step, opening them finishes it. If staff do, you mark it done after seeing what they opened and their notes.</p>
    <ResourcePickerModal open={picking} setOpen={setPicking} title="Resources to check out" exclude={picked.map((item) => item.resource_uuid)}
      onPick={(rows) => onChange({ ...config, resources: [...picked, ...rows.map((row) => ({ resource_uuid: row.resource_uuid, title: row.title }))].slice(0, MAX) })} />
  </div>
}

export const resources: StepDefinition<'resources'> = {
  type: 'resources',
  label: 'Resources',
  color: '#1A86AE',
  hint: 'A few resources to check out. You see what they opened and their notes.',
  example: 'Check out these two college cost guides',
  icon: Library,
  statusLine: (step) => {
    const total = step.config.resources?.length || 0
    return total ? `${openedCount(step)} of ${neededOf(step)} opened` : null
  },
  RowResult: ResourcesRow,
  CardBody: ResourcesCard,
  ConfigPanel: ResourcesConfigPanel,
  defaultConfig: () => ({ resources: [] }),
  cleanConfig: (config) => ({ resources: config.resources || [], ...(config.required ? { required: config.required } : {}) }),
  configProblem: (config) => (config.resources || []).length ? null : 'Add at least one resource',
}
