'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, Plus, Sparkles, Undo2, X } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { saveHubEditObjectState, type HubEditObjectState, type HubEditRun } from '@services/hub/advisor'
import { goalCoachApi } from '@services/goals/coach'
import { goalsApi } from '@services/goals/goals'
import type { Goal, StepTypeKey } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { useGoalMutation } from '../useGoalActions'
import { stepDefinition } from '../steps'
import type { StepDraft } from './StepEditor'
import { liveMode, stepInput } from './stepDrafts'
import type { PendingGoalChange, PendingStage, PendingStageChange, PendingStep, PendingStepChange, SuggestionKind } from './useGoalProposals'

type Fields = Record<string, string | number | boolean | null>
type ObjectStatus = 'editing' | 'cancelled' | 'saved'
// eslint-disable-next-line no-unused-vars
type OnSettled = (item: { runUuid: string; active: boolean }, localId: string, kind: SuggestionKind, decision: string) => void

/** The run with one object's saved state, plus the learner event the server records for a save or cancel. */
export function updateRunObjectState(run: HubEditRun, saved: HubEditObjectState, status: ObjectStatus, label: string): HubEditRun {
  const objects = [...run.objects.filter((item) => item.object_key !== saved.object_key), saved]
  if (status === 'editing' || run.events.some((event) => event.payload?.object_key === saved.object_key && event.kind === `${saved.object_type}.${status}`)) return { ...run, objects }
  const sequence = Math.max(0, ...run.events.map((event) => Number(event.sequence || 0))) + 1
  return { ...run, objects, events: [...run.events, {
    event_uuid: `local:${saved.object_key}:${status}`, sequence, kind: `${saved.object_type}.${status}`,
    summary: `${status === 'saved' ? 'Saved' : 'Cancelled'} ${label}`, object_type: saved.object_type, object_uuid: saved.object_uuid,
    object_label: label, transient: false, payload: { object_key: saved.object_key }, created_at: new Date().toISOString(),
  }] }
}

/** Records the learner's decision on one suggestion in the session it came from, running or ended. */
function useRecordDecision(runUuid: string, objectKey: string, objectType: 'goal' | 'stage' | 'step', recovered: HubEditObjectState | undefined, token?: string) {
  const hub = useHub()
  const org = useOrg() as { id?: number } | null
  const revision = React.useRef(recovered?.revision || 0)
  return async (current: Fields, proposal: Fields, status: 'saved' | 'cancelled', label: string, objectUuid?: string | null) => {
    if (!org?.id) return
    try {
      const saved = await saveHubEditObjectState(org.id, runUuid, objectKey, { object_type: objectType, object_uuid: objectUuid, current_fields: current, proposal_fields: proposal, status, expected_revision: revision.current }, token || '')
      revision.current = saved.revision
      hub?.setEditRun((value) => value?.run_uuid === runUuid ? updateRunObjectState(value, saved, status, label) : value)
    } catch (error: any) {
      toast.error(error?.status === 409 ? 'This suggestion changed in another tab. Reload to see the latest.' : 'Coach couldn’t note that choice, but your goal is saved.')
    }
  }
}

/** Shows the suggestion in Coach's review list while it waits for a decision. */
function useReviewItem(key: string, label: string, objectType: string, targetId: string) {
  const setItems = useHub()?.setEditReviewItems
  React.useEffect(() => {
    setItems?.((current) => current.some((item) => item.key === key) ? current : [...current, { key, label, objectType, targetId }])
    return () => setItems?.((current) => current.filter((item) => item.key !== key))
  }, [key, label, objectType, setItems, targetId])
}

const lineButton = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/25 transition hover:border-[var(--plan-face)] hover:bg-[var(--plan-face)] hover:text-[var(--plan-face-ink)] disabled:opacity-50'
const dropButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-60 transition hover:bg-muted hover:opacity-100'
const tag = <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-60">suggested</span>

function stepFields(draft: StepDraft, stageUuid: string): Fields {
  return { type: draft.type, title: draft.title, description: draft.description, due_date: draft.due_date || '', stage_uuid: stageUuid, config: JSON.stringify(draft.config) }
}

function recoveredDraft(base: StepDraft, fields?: Fields): StepDraft {
  if (!fields) return base
  let config = base.config
  try { if (typeof fields.config === 'string') config = JSON.parse(fields.config) } catch { /* keep Coach's settings */ }
  const type = (typeof fields.type === 'string' ? fields.type : base.type) as StepTypeKey
  return { ...base, type, config, title: String(fields.title ?? base.title), description: String(fields.description ?? base.description), due_date: fields.due_date ? String(fields.due_date) : null }
}

/**
 * A step Coach suggested, as one quiet line where it would go: + adds it as an ordinary step the
 * learner can then change or remove, x drops it. Lines only show while the goal is being edited.
 */
export function SuggestedStepLine({ goal, item, token, onSettled }: { goal: Goal; item: PendingStep; token?: string; onSettled: OnSettled }) {
  const { step, stageUuid, recovered } = item
  const mode = liveMode(goal)
  const base = React.useMemo<StepDraft>(() => ({ type: step.type, title: step.title, description: step.description, config: step.config, completed_by: 'learner', review_required: false, reviewer_guidance: '', after: [], due_date: step.due_date || null }), [step])
  const draft = React.useMemo(() => recoveredDraft(base, recovered?.current_fields), [base, recovered])
  const [saving, setSaving] = React.useState(false)
  const { run } = useGoalMutation(goal.goal_uuid)
  const targetId = `hub-edit-step-${step.local_id}`
  const label = draft.title || step.title
  const record = useRecordDecision(item.runUuid, step.local_id, 'step', recovered, token)
  useReviewItem(step.local_id, step.title, 'step', targetId)
  const current = stepFields(draft, stageUuid)
  const Icon = stepDefinition(draft.type).icon

  const drop = async () => {
    setSaving(true)
    await record(current, stepFields(base, stageUuid), 'cancelled', label)
    onSettled(item, step.local_id, 'steps', `I dropped the suggested step “${label}”.`)
  }
  const keep = async () => {
    if (!draft.title.trim()) return
    setSaving(true)
    try {
      const input = { ...stepInput(draft, mode), stage_uuid: stageUuid || null, materials: step.materials || [], request_key: step.local_id }
      const result = await run(() => goalCoachApi.addStep(goal.goal_uuid, input, token))
      await record(current, stepFields(base, stageUuid), 'saved', label, (result as { created_step_uuid?: string | null })?.created_step_uuid)
      const stage = goal.stages.find((entry) => entry.stage_uuid === stageUuid)
      onSettled(item, step.local_id, 'steps', `I added the suggested step “${draft.title.trim()}” (${draft.type}) to ${stage ? `stage “${stage.title}”` : 'no stage'}.`)
    } catch { setSaving(false) /* useGoalMutation already said what went wrong */ }
  }

  return <li id={targetId} tabIndex={-1} aria-label={`Suggested step ${label}`} title={draft.description || undefined} className="group flex items-center gap-3 rounded-xl py-1 pr-2 text-sm text-muted-foreground outline-none transition hover:bg-current/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--plan-face)]">
    <span className="flex w-14 shrink-0 justify-center">
      <button type="button" disabled={saving} onClick={() => void keep()} aria-label={`Add ${label}`} className={lineButton}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}</button>
    </span>
    <Icon size={14} aria-hidden="true" className="shrink-0 opacity-70" />
    <span className="min-w-0 flex-1 truncate">{label}{step.why ? <span className="ml-2 text-xs opacity-70">{step.why}</span> : null}</span>
    {tag}
    <button type="button" disabled={saving} onClick={() => void drop()} aria-label={`Drop ${label}`} className={dropButton}><X size={14} /></button>
  </li>
}

/** A stage Coach suggested, as a quiet line where the stage would go: + adds it, x drops it. */
export function SuggestedStageLine({ goal, item, token, onSettled }: { goal: Goal; item: PendingStage; token?: string; onSettled: OnSettled }) {
  const { stage, position, recovered } = item
  const [saving, setSaving] = React.useState(false)
  const { run } = useGoalMutation(goal.goal_uuid)
  const targetId = `hub-edit-stage-${stage.local_id}`
  const fields: Fields = { title: stage.title, description: stage.description, timing: stage.timing }
  const record = useRecordDecision(item.runUuid, stage.local_id, 'stage', recovered, token)
  useReviewItem(stage.local_id, stage.title, 'stage', targetId)

  const drop = async () => {
    setSaving(true)
    await record(fields, fields, 'cancelled', stage.title)
    onSettled(item, stage.local_id, 'stages', `I dropped the suggested stage “${stage.title}”.`)
  }
  const keep = async () => {
    setSaving(true)
    try {
      const result = await run(() => goalCoachApi.addStage(goal.goal_uuid, { request_key: stage.local_id, position, title: stage.title, description: stage.description, timing: stage.timing }, token))
      await record(fields, fields, 'saved', stage.title, (result as { created_stage_uuid?: string | null })?.created_stage_uuid)
      onSettled(item, stage.local_id, 'stages', `I added the suggested stage “${stage.title}”${stage.timing ? ` (${stage.timing})` : ''}.`)
    } catch { setSaving(false) /* useGoalMutation already said what went wrong */ }
  }

  return <div id={targetId} tabIndex={-1} role="group" aria-label={`Suggested stage ${stage.title}`} title={stage.description || undefined}
    className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/40 px-4 py-2 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-face)]">
    <button type="button" disabled={saving} onClick={() => void keep()} aria-label={`Add ${stage.title}`} className={lineButton}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}</button>
    <span className="min-w-0 flex-1 truncate font-extrabold">{stage.title}{stage.timing ? <span className="ml-2 text-xs font-bold opacity-70">{stage.timing}</span> : null}</span>
    {tag}
    <button type="button" disabled={saving} onClick={() => void drop()} aria-label={`Drop ${stage.title}`} className={dropButton}><X size={14} /></button>
  </div>
}

const quote = (text: string, length = 70) => `“${text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text}”`

/** What a suggested change does, in a line: "Rename to “…” · Move to “…”". */
export function describeChange(change: PendingStepChange['change'] | PendingStageChange['change'] | PendingGoalChange['change'], noun: string) {
  if ('remove' in change && change.remove) return `Remove this ${noun}`
  const parts: string[] = []
  if (change.title) parts.push(`Rename to ${quote(change.title)}`)
  if ('stage_title' in change && change.stage_title) parts.push(`Move to ${quote(change.stage_title, 40)}`)
  if ('milestone' in change && change.milestone) parts.push(`Milestone: ${quote(change.milestone)}`)
  if ('timing' in change && change.timing) parts.push(`Timing: ${quote(change.timing, 40)}`)
  if ('description' in change && change.description) parts.push(`${noun === 'goal' ? 'Why' : 'Notes'}: ${quote(change.description)}`)
  return parts.join(' · ')
}

/**
 * A change Coach suggests to a row the goal already has, shown on that row: Keep makes the
 * change, Undo leaves the row as it is. Nothing changes until the learner keeps it.
 */
function ChangeLine({ id, label, summary, reason, objectType, recordKey, item, kind, token, onKeep, onSettled }: {
  id: string; label: string; summary: string; reason: string; objectType: 'goal' | 'stage' | 'step'; recordKey: string
  item: { runUuid: string; active: boolean }; kind: SuggestionKind; token?: string; onKeep: () => Promise<unknown>; onSettled: OnSettled
}) {
  const [saving, setSaving] = React.useState(false)
  const record = useRecordDecision(item.runUuid, recordKey, objectType, undefined, token)
  const targetId = `hub-edit-change-${id}`
  useReviewItem(recordKey, `${label}: ${summary}`, objectType, targetId)
  const fields: Fields = { summary }

  const undo = async () => {
    setSaving(true)
    await record(fields, fields, 'cancelled', label)
    onSettled(item, recordKey, kind, `I undid the suggested change to ${objectType} “${label}” (${summary}).`)
  }
  const keep = async () => {
    setSaving(true)
    try {
      await onKeep()
      await record(fields, fields, 'saved', label)
      onSettled(item, recordKey, kind, `I kept the suggested change to ${objectType} “${label}” (${summary}).`)
    } catch { setSaving(false) /* the mutation already said what went wrong */ }
  }

  return <div id={targetId} tabIndex={-1} role="group" aria-label={`Coach suggests: ${summary}`}
    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-[var(--plan-face)]/60 bg-[color-mix(in_srgb,var(--plan-face)_8%,transparent)] px-3 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-face)]">
    <Sparkles size={13} aria-hidden="true" className="shrink-0 text-[var(--plan-accent)]" />
    <span className="min-w-0 flex-1"><span className="font-bold">{summary}</span>{reason ? <span className="ml-2 text-muted-foreground">{reason}</span> : null}</span>
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={saving} onClick={() => void keep()} className={cn('rounded-full px-3 py-1 font-bold transition disabled:opacity-50', 'bg-[var(--plan-face)] text-[var(--plan-face-ink)] hover:opacity-90')}>{saving ? <Loader2 size={12} className="animate-spin" /> : 'Keep'}</button>
      <button type="button" disabled={saving} onClick={() => void undo()} className="flex items-center gap-1 rounded-full px-2 py-1 font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"><Undo2 size={12} aria-hidden="true" />Undo</button>
    </span>
  </div>
}

export function StepChangeLine({ goal, item, token, onSettled }: { goal: Goal; item: PendingStepChange; token?: string; onSettled: OnSettled }) {
  const { change } = item
  const { run } = useGoalMutation(goal.goal_uuid)
  const keep = async () => {
    if (change.remove) return run(() => goalsApi.deleteStep(goal.goal_uuid, change.step_uuid, token))
    const edits = { ...(change.title ? { title: change.title } : {}), ...(change.description ? { description: change.description } : {}) }
    if (Object.keys(edits).length) await run(() => goalsApi.updateStep(goal.goal_uuid, change.step_uuid, edits, token), undefined, true)
    const target = goal.stages.find((stage) => stage.stage_uuid === change.stage_uuid)
    if (target) await run(() => goalsApi.moveStep(goal.goal_uuid, change.step_uuid, { stage_uuid: target.stage_uuid, position: target.steps.length }, token), undefined, true)
  }
  return <ChangeLine id={change.local_id} recordKey={change.local_id} label={change.from.title} summary={describeChange(change, 'step')} reason={change.reason}
    objectType="step" item={item} kind="changes" token={token} onKeep={keep} onSettled={onSettled} />
}

export function StageChangeLine({ goal, item, token, onSettled }: { goal: Goal; item: PendingStageChange; token?: string; onSettled: OnSettled }) {
  const { change } = item
  const { run } = useGoalMutation(goal.goal_uuid)
  const keep = async () => {
    if (change.remove) return run(() => goalsApi.deleteStage(goal.goal_uuid, change.stage_uuid, token))
    const edits = Object.fromEntries((['title', 'milestone', 'timing'] as const).filter((key) => change[key]).map((key) => [key, change[key]]))
    return run(() => goalsApi.updateStage(goal.goal_uuid, change.stage_uuid, edits, token), undefined, true)
  }
  return <ChangeLine id={change.local_id} recordKey={change.local_id} label={change.from.title} summary={describeChange(change, 'stage')} reason={change.reason}
    objectType="stage" item={item} kind="changes" token={token} onKeep={keep} onSettled={onSettled} />
}

export function GoalChangeLine({ goal, item, token, onSettled }: { goal: Goal; item: PendingGoalChange; token?: string; onSettled: OnSettled }) {
  const { change } = item
  const { run } = useGoalMutation(goal.goal_uuid)
  const keep = () => run(() => goalsApi.update(goal.goal_uuid, { ...(change.title ? { title: change.title } : {}), ...(change.description ? { description: change.description } : {}) }, token), undefined, true)
  return <ChangeLine id={change.local_id} recordKey={change.local_id} label={change.from.title} summary={describeChange(change, 'goal')} reason={change.reason}
    objectType="goal" item={item} kind="changes" token={token} onKeep={keep} onSettled={onSettled} />
}
