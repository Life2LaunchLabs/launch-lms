'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import type { Goal, StepCompleter, StepConfigs, StepTypeKey } from '@services/goals/types'
import { STEP_TYPE_ORDER, stepDefinition } from '../steps'
import StepTiming from './StepTiming'

/**
 * One step being written, the same shape wherever steps are edited: a template draft, a live
 * goal (staff or a cohort edit) or a learner's own goal. ``after`` holds template step keys in a
 * template and step uuids on a live goal; a template counts in ``due_week``, a live goal in its
 * own open and close dates (none means it opens and closes with its stage).
 */
export interface StepDraft<T extends StepTypeKey = StepTypeKey> {
  type: T
  title: string
  description: string
  config: StepConfigs[T]
  completed_by: StepCompleter
  review_required: boolean
  reviewer_guidance: string
  after: string[]
  due_week?: number | null
  start_date?: string | null
  due_date?: string | null
}

export type StepEditorMode = 'template' | 'live' | 'personal'

export function newStepDraft<T extends StepTypeKey>(type: T, title = ''): StepDraft<T> {
  return { type, title, description: '', config: stepDefinition(type).defaultConfig(), completed_by: 'learner', review_required: false, reviewer_guidance: '', after: [] }
}

/** The step types as a row of choices, each with its icon and what it is for. */
export function StepTypePicker({ value, onChange, personal = false, types: only }: { value?: StepTypeKey; onChange: (type: StepTypeKey) => void; personal?: boolean; types?: StepTypeKey[] }) { // eslint-disable-line no-unused-vars
  // A learner's own goal can't point at an organization's activities or badges.
  const types = only || (personal ? STEP_TYPE_ORDER.filter((type) => type !== 'activity') : STEP_TYPE_ORDER)
  return <div role="radiogroup" aria-label="Step type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {types.map((type) => {
      const definition = stepDefinition(type)
      const Icon = definition.icon
      return <button key={type} type="button" role="radio" aria-checked={value === type} onClick={() => onChange(type)} title={definition.hint}
        className={cn('flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-bold transition', value === type ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))]' : 'border-border bg-background hover:border-[var(--plan-face)]')}>
        <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--plan-accent)]" />{definition.label}
      </button>
    })}
  </div>
}

type StepEditorProps = {
  value: StepDraft
  // eslint-disable-next-line no-unused-vars
  onChange: (value: StepDraft) => void
  mode: StepEditorMode
  /** Template steps this one can wait for, by key, with their titles. */
  others?: Array<{ id: string; title: string }>
  /** On a live goal: the goal, the stage the step sits in and the step itself (none while adding), for its timing. */
  live?: { goal: Goal; stageUuid: string | null; stepUuid?: string }
  /** The type can only change before the step exists. */
  typeLocked?: boolean
  orgId?: number | null
  token?: string
}

/**
 * The single step editor: type, title, details, the type's own settings, who finishes it and
 * when it opens. Learners editing their own goal see only what applies to them.
 */
export default function StepEditor({ value, onChange, mode, others = [], live, typeLocked = false, orgId, token }: StepEditorProps) {
  const definition = stepDefinition(value.type)
  const ConfigPanel = definition.ConfigPanel as React.ComponentType<any> | undefined
  const set = (patch: Partial<StepDraft>) => onChange({ ...value, ...patch })
  const personal = mode === 'personal'
  return <div className="flex flex-col gap-4">
    {typeLocked ? null : <StepTypePicker value={value.type} personal={personal} onChange={(type) => type !== value.type && onChange({ ...value, type, config: stepDefinition(type).defaultConfig() })} />}
    <div className="flex flex-col gap-1"><Label htmlFor="step-title">Title</Label><Input id="step-title" value={value.title} onChange={(event) => set({ title: event.target.value })} placeholder="What needs to happen?" /></div>
    <div className="flex flex-col gap-1"><Label htmlFor="step-details">Details</Label><Textarea id="step-details" rows={3} value={value.description} onChange={(event) => set({ description: event.target.value })} placeholder="Anything that helps" /></div>
    {ConfigPanel ? <ConfigPanel config={value.config} onChange={(config: StepConfigs[StepTypeKey]) => set({ config })} orgId={orgId} token={token} /> : null}
    {personal ? null : <div className="flex flex-col gap-2 border-t pt-4">
      <Label>Who marks it done</Label>
      <div className="flex flex-wrap gap-2">
        {(['learner', 'staff'] as const).map((who) => <button key={who} type="button" aria-pressed={value.completed_by === who} onClick={() => set({ completed_by: who, review_required: who === 'staff' ? false : value.review_required })}
          className={cn('rounded-xl border-2 px-3 py-1.5 text-sm font-bold', value.completed_by === who ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))]' : 'border-border')}>{who === 'learner' ? 'The learner' : 'Staff'}</button>)}
      </div>
      {value.completed_by === 'learner' && !definition.finishesItself ? <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={value.review_required} onChange={(event) => set({ review_required: event.target.checked })} />Staff review it before it counts</label> : null}
      {value.review_required || value.completed_by === 'staff' ? <div className="flex flex-col gap-1"><Label htmlFor="step-guidance">Notes for reviewers</Label><Textarea id="step-guidance" rows={2} value={value.reviewer_guidance} onChange={(event) => set({ reviewer_guidance: event.target.value })} placeholder="What a good one looks like" /></div> : null}
    </div>}
    {mode === 'template' ? <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1"><Label htmlFor="step-week">Due in week</Label><Input id="step-week" type="number" min={1} value={value.due_week ?? ''} onChange={(event) => set({ due_week: event.target.value ? Math.max(1, Number(event.target.value)) : null })} placeholder="No due week" /></div>
      <AfterPicker value={value} others={others} set={set} />
    </div> : live ? <details className="group/settings border-t pt-3">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-muted-foreground">
        <span>Settings <span className="font-normal">· {value.start_date || value.due_date || value.after.length ? 'timing set' : 'opens and closes with its stage'}</span></span>
        <span aria-hidden="true" className="text-xs transition-transform group-open/settings:rotate-180">▾</span>
      </summary>
      <div className="mt-3 flex flex-col gap-2"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Timing</span><StepTiming {...live} value={value} set={set} token={token} /></div>
    </details> : null}
  </div>
}

type TimingProps = { value: StepDraft; others: Array<{ id: string; title: string }>; set: (patch: Partial<StepDraft>) => void } // eslint-disable-line no-unused-vars

/** Other steps this one waits for. */
function AfterPicker({ value, others, set }: TimingProps) {
  if (!others.length) return null
  return <div className="flex flex-col gap-1 sm:col-span-2">
    <Label>Starts after</Label>
    <div className="flex flex-wrap gap-1.5">
      {others.map((other) => {
        const on = value.after.includes(other.id)
        return <button key={other.id} type="button" aria-pressed={on} onClick={() => set({ after: on ? value.after.filter((id) => id !== other.id) : [...value.after, other.id] })}
          className={cn('max-w-[16rem] truncate rounded-[10px] border-2 px-2.5 py-1 text-xs font-bold', on ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))]' : 'border-border text-muted-foreground')}>{other.title || 'Untitled step'}</button>
      })}
    </div>
  </div>
}
