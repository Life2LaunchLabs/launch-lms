'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import type { Goal, StepCompleter, StepConfigs, StepMaterial, StepTypeKey } from '@services/goals/types'
import { STEP_TYPE_ORDER, stepDefinition } from '../steps'
import MaterialsEditor from './MaterialsEditor'
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
  /** Template steps only: files and links learners open, and the staff guide (a lesson plan with its own files). */
  materials?: StepMaterial[]
  staff_guide?: string
  staff_materials?: StepMaterial[]
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

/** The config as it's saved, without what the editor only shows (such as empty options). */
export function savedConfig(draft: StepDraft) {
  const clean = stepDefinition(draft.type).cleanConfig as ((config: StepConfigs[StepTypeKey]) => StepConfigs[StepTypeKey]) | undefined // eslint-disable-line no-unused-vars
  return clean ? clean(draft.config) : draft.config
}

/** Why the draft can't be saved yet: no title, or the type's own settings aren't complete. */
export function draftProblem(draft: StepDraft): string | null {
  if (!draft.title.trim()) return 'Give it a title'
  const problem = stepDefinition(draft.type).configProblem as ((config: StepConfigs[StepTypeKey]) => string | null) | undefined // eslint-disable-line no-unused-vars
  return problem ? problem(draft.config) : null
}

/**
 * The single step editor: type, title and what the type needs. On a template, learner instructions,
 * materials and the staff guide are add-ons until they're used, and review and who marks it done
 * show up front; the fiddly bits (the type's settings, timing) wait in a closed More settings
 * section. Learners editing their own goal see only what applies to them.
 */
export default function StepEditor({ value, onChange, mode, others = [], live, typeLocked = false, orgId, token }: StepEditorProps) {
  const definition = stepDefinition(value.type)
  const ConfigPanel = definition.ConfigPanel as React.ComponentType<any> | undefined
  const SettingsPanel = definition.SettingsPanel as React.ComponentType<any> | undefined
  const set = (patch: Partial<StepDraft>) => onChange({ ...value, ...patch })
  const setConfig = (config: StepConfigs[StepTypeKey]) => set({ config })
  const personal = mode === 'personal'
  const template = mode === 'template'
  const problem = value.title.trim() ? draftProblem(value) : null
  const timed = value.start_date || value.due_date || value.after.length || value.due_week
  // A template's optional parts stay folded into "+" buttons until they're added or already used.
  const [shown, setShown] = React.useState(() => ({ details: !template || !!value.description, materials: !!value.materials?.length, staff: !!(value.staff_guide || value.staff_materials?.length) }))
  const addons = template ? ([['details', 'Learner instructions'], ['materials', 'Materials'], ['staff', 'Staff guide']] as const).filter(([key]) => !shown[key]) : []
  const summary = [
    timed ? 'timing set' : template ? null : 'opens and closes with its stage',
    personal || template ? null : value.completed_by === 'staff' ? 'staff mark it done' : value.review_required ? 'staff review it' : null,
  ].filter(Boolean).join(' · ')
  const whoMarks = personal ? null : <WhoMarksDone value={value} set={set} finishesItself={!!definition.finishesItself} framed={template} />
  return <div className="flex flex-col gap-4">
    {typeLocked ? null : <StepTypePicker value={value.type} personal={personal} onChange={(type) => type !== value.type && onChange({ ...value, type, config: stepDefinition(type).defaultConfig() })} />}
    <div className="flex flex-col gap-1.5"><Label htmlFor="step-title">Title</Label><Input id="step-title" value={value.title} onChange={(event) => set({ title: event.target.value })} placeholder={template ? `e.g. ${definition.example}` : 'What needs to happen?'} className={cn(template && 'h-11 text-[15px] font-semibold')} /></div>
    {shown.details ? <div className="flex flex-col gap-1.5"><Label htmlFor="step-details">{template ? 'Learner instructions' : 'Details'}</Label><Textarea id="step-details" rows={3} value={value.description} onChange={(event) => set({ description: event.target.value })} placeholder={template ? 'What should they do, and why?' : 'Anything that helps'} autoFocus={template && !value.description} /></div> : null}
    {ConfigPanel ? <ConfigPanel config={value.config} onChange={setConfig} orgId={orgId} token={token} personal={personal} /> : null}
    {template && shown.materials ? <div className="flex flex-col gap-1.5">
      <Label htmlFor="step-materials">Materials</Label>
      <MaterialsEditor id="step-materials" value={value.materials || []} onChange={(materials) => set({ materials })} orgId={orgId} token={token} />
    </div> : null}
    {template && shown.staff ? <StaffGuide value={value} set={set} orgId={orgId} token={token} /> : null}
    {addons.length ? <div className="flex flex-wrap gap-2">{addons.map(([key, label]) => <button key={key} type="button" onClick={() => setShown((current) => ({ ...current, [key]: true }))}
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-[var(--plan-face)] hover:text-foreground">
      <Plus size={15} aria-hidden="true" />{label}
    </button>)}</div> : null}
    {problem ? <p role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-400">{problem}</p> : null}
    {template ? whoMarks : null}
    <details className="group/settings border-t pt-3">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-muted-foreground">
        <span>{template ? 'More settings' : 'Settings'}{summary ? <span className="font-normal"> · {summary}</span> : null}</span>
        <span aria-hidden="true" className="text-xs transition-transform group-open/settings:rotate-180">▾</span>
      </summary>
      <div className="mt-3 flex flex-col gap-5">
        {SettingsPanel ? <SettingsPanel config={value.config} onChange={setConfig} orgId={orgId} token={token} personal={personal} /> : null}
        {template || !whoMarks ? null : <Setting title="Who marks it done">{whoMarks}</Setting>}
        {template ? <Setting title="Timing">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1"><Label htmlFor="step-week">Due in week</Label><Input id="step-week" type="number" min={1} value={value.due_week ?? ''} onChange={(event) => set({ due_week: event.target.value ? Math.max(1, Number(event.target.value)) : null })} placeholder="No due week" /></div>
            <AfterPicker value={value} others={others} set={set} />
          </div>
        </Setting> : live ? <Setting title="Timing"><StepTiming {...live} value={value} set={set} token={token} /></Setting> : null}
      </div>
    </details>
  </div>
}

/**
 * Review before it counts, and who marks it done (the learner, or staff for things like a meeting),
 * with notes for whoever reviews. Steps that finish themselves (activities, badges) have neither.
 * `framed`: as framed rows in the editor's body rather than inside Settings.
 */
function WhoMarksDone({ value, set, finishesItself, framed }: { value: StepDraft; set: (patch: Partial<StepDraft>) => void; finishesItself: boolean; framed: boolean }) { // eslint-disable-line no-unused-vars
  if (finishesItself && framed) return null
  const guidance = value.review_required || value.completed_by === 'staff'
    ? <div className="flex flex-col gap-1"><Label htmlFor="step-guidance">Notes for reviewers</Label><Textarea id="step-guidance" rows={2} value={value.reviewer_guidance} onChange={(event) => set({ reviewer_guidance: event.target.value })} placeholder="What a good one looks like" /></div> : null
  const who = <div className="inline-flex flex-wrap gap-0.5 self-start rounded-xl bg-muted p-[3px]">
    {(['learner', 'staff'] as const).map((person) => <button key={person} type="button" aria-pressed={value.completed_by === person} onClick={() => set({ completed_by: person, review_required: person === 'staff' ? false : value.review_required })}
      className={cn('rounded-[9px] px-3 py-[7px] text-[13px] font-semibold', value.completed_by === person ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{person === 'learner' ? 'The learner' : framed ? 'Staff, like a meeting' : 'Staff'}</button>)}
  </div>
  if (!framed) return <>
    {who}
    {value.completed_by === 'learner' && !finishesItself ? <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={value.review_required} onChange={(event) => set({ review_required: event.target.checked })} />Staff review it before it counts</label> : null}
    {guidance}
  </>
  return <>
    {value.completed_by === 'learner' ? <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-border px-3.5 py-3">
      <span className="min-w-0 flex-1"><b className="block text-sm">Review before it counts</b><span className="text-[12.5px] text-muted-foreground">You approve their work before the step is done</span></span>
      <Switch checked={value.review_required} onCheckedChange={(checked) => set({ review_required: checked })} aria-label="Review before it counts" className="h-6 w-[42px] data-[state=checked]:bg-emerald-600 [&>span]:h-[18px] [&>span]:w-[18px] [&>span]:data-[state=checked]:translate-x-[18px]" />
    </label> : null}
    <div className="flex flex-col gap-1.5"><span className="text-[13px] font-bold">Who marks it done</span>{who}</div>
    {guidance}
  </>
}

/**
 * What staff need to run the step, like a lesson plan: how to lead it and the files they use
 * (a packet, slides, an answer key). Staff see it on the assignment's plan; learners never do.
 */
function StaffGuide({ value, set, orgId, token }: { value: StepDraft; set: (patch: Partial<StepDraft>) => void; orgId?: number | null; token?: string }) { // eslint-disable-line no-unused-vars
  return <section aria-labelledby="step-staff-guide" className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/40 p-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <Label id="step-staff-guide" htmlFor="step-staff-notes" className="text-sm font-black">Staff guide</Label>
      <span className="text-xs text-muted-foreground">Only staff see this</span>
    </div>
    <Textarea id="step-staff-notes" rows={4} value={value.staff_guide || ''} onChange={(event) => set({ staff_guide: event.target.value })}
      placeholder="How to run this step: the lesson plan, timing, what to prepare, what to say" className="bg-background font-mono text-[13px]" />
    <p className="-mt-2 text-xs text-muted-foreground">Markdown works: # headings, - lists, **bold**, links. Staff open it with the files below in one viewer.</p>
    <MaterialsEditor id="step-staff-materials" value={value.staff_materials || []} onChange={(staff_materials) => set({ staff_materials })} orgId={orgId} token={token} addLabel="Add for staff" />
  </section>
}

/** One group in the Settings section. */
export function Setting({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</span>{children}</div>
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
