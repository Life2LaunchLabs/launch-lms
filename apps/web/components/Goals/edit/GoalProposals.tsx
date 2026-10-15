'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { saveHubEditObjectState, type HubEditObjectState, type HubEditRun, type HubProposedStage, type HubProposedStep } from '@services/hub/advisor'
import { goalCoachApi } from '@services/goals/coach'
import type { Goal, StepTypeKey } from '@services/goals/types'
import { useGoalMutation } from '../useGoalActions'
import StepEditor, { type StepDraft } from './StepEditor'
import { liveMode, otherSteps, stepInput } from './stepDrafts'

type Fields = Record<string, string | number | boolean | null>
type ObjectStatus = 'editing' | 'cancelled' | 'saved'

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

/** Keeps a proposal's unsaved edits in Coach's run, so they survive a reload for up to 30 days. */
function useRunObject(goal: Goal, objectKey: string, objectType: 'stage' | 'step', recovered: HubEditObjectState | undefined, token?: string) {
  const hub = useHub()
  const org = useOrg() as { id?: number } | null
  const revision = React.useRef(recovered?.revision || 0)
  const queue = React.useRef<Promise<void>>(Promise.resolve())
  const warned = React.useRef(false)
  return (current: Fields, proposal: Fields, status: ObjectStatus, label: string, objectUuid?: string | null) => {
    const run = hub?.editRun
    if (!run || run.status !== 'active' || run.scope.kind !== 'goal' || run.scope.target_uuid !== goal.goal_uuid || !org?.id) return Promise.resolve()
    queue.current = queue.current.catch(() => undefined).then(async () => {
      const saved = await saveHubEditObjectState(org.id!, run.run_uuid, objectKey, { object_type: objectType, object_uuid: objectUuid, current_fields: current, proposal_fields: proposal, status, expected_revision: revision.current }, token || '')
      revision.current = saved.revision
      hub.setEditRun((value) => value?.run_uuid === run.run_uuid ? updateRunObjectState(value, saved, status, label) : value)
    }).catch((error: { status?: number }) => {
      if (warned.current) return
      warned.current = true
      toast.error(error?.status === 409 ? `This ${objectType} changed in another tab. Reload to recover the latest version.` : `Coach couldn’t keep this unsaved ${objectType} yet.`)
    })
    return queue.current
  }
}

/** Shows the proposal in the hub's review list while it waits for a decision. */
function useReviewItem(key: string, label: string, objectType: string, targetId: string) {
  const setItems = useHub()?.setEditReviewItems
  React.useEffect(() => {
    setItems?.((current) => current.some((item) => item.key === key) ? current : [...current, { key, label, objectType, targetId }])
  }, [key, label, objectType, setItems, targetId])
  return React.useCallback(() => setItems?.((current) => current.filter((item) => item.key !== key)), [key, setItems])
}

function review(current: Fields, proposal: Fields) {
  return Object.keys(proposal).map((key) => `${key}: ${String(current[key] ?? '') === String(proposal[key] ?? '') ? 'accepted Coach suggestion' : 'customized by me'}`).join('; ')
}

/** Debounced persistence of the whole object while the learner edits it. */
function usePersistWhileEditing(persist: () => Promise<void>, deps: unknown[]) {
  React.useEffect(() => {
    const timer = window.setTimeout(() => { void persist() }, 500)
    return () => window.clearTimeout(timer)
    // Persist the complete object after the learner pauses typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const suggested = <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"><Sparkles size={10} aria-hidden="true" />Suggested by Coach</span>

/** A stage Coach proposed: the learner can change it, then save or cancel it. */
// eslint-disable-next-line no-unused-vars
export function ProposedStageEditor({ goal, stage, position, recovered, token, onSettled }: { goal: Goal; stage: HubProposedStage; position: number; recovered?: HubEditObjectState; token?: string; onSettled: (localId: string, decision: string) => void }) {
  const proposal = React.useMemo<Fields>(() => ({ title: stage.title, description: stage.description, timing: stage.timing }), [stage])
  const [fields, setFields] = React.useState<Fields>(() => ({ ...proposal, ...(recovered?.current_fields || {}) }))
  const [saving, setSaving] = React.useState(false)
  const { run } = useGoalMutation(goal.goal_uuid)
  const targetId = `hub-edit-stage-${stage.local_id}`
  const label = String(fields.title || stage.title)
  const persist = useRunObject(goal, stage.local_id, 'stage', recovered, token)
  const clearReview = useReviewItem(stage.local_id, stage.title, 'stage', targetId)
  usePersistWhileEditing(() => persist(fields, proposal, 'editing', label), [fields])
  const text = (key: string) => String(fields[key] ?? '')

  const cancel = async () => {
    setSaving(true)
    await persist(fields, proposal, 'cancelled', label)
    clearReview(); setSaving(false)
    onSettled(stage.local_id, `I cancelled stage “${label}”. Review: ${review(fields, proposal)}.`)
  }
  const save = async () => {
    if (!text('title').trim()) return
    setSaving(true)
    try {
      const result = await run(() => goalCoachApi.addStage(goal.goal_uuid, { request_key: stage.local_id, position, title: text('title').trim(), description: text('description'), timing: text('timing') }, token), 'Stage added')
      await persist(fields, proposal, 'saved', label, (result as { created_stage_uuid?: string | null })?.created_stage_uuid)
      clearReview()
      onSettled(stage.local_id, `I saved stage “${text('title').trim()}”. Timing: ${text('timing') || 'none'}; description: “${text('description').slice(0, 800)}”. Review: ${review(fields, proposal)}.`)
    } catch { /* useGoalMutation already said what went wrong */ } finally { setSaving(false) }
  }

  return <section id={targetId} tabIndex={-1} aria-label={`Proposed stage ${label}`} className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-violet-300 bg-card p-4 outline-none">
    <div className="flex items-center justify-between gap-2">{suggested}
      <span className="flex gap-1">
        <Button type="button" variant="ghost" size="icon" disabled={saving} onClick={() => void cancel()} aria-label={`Cancel stage ${label}`}><X size={15} /></Button>
        <Button type="button" variant="plan" size="icon" disabled={saving || !text('title').trim()} onClick={() => void save()} aria-label={`Save stage ${label}`}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}</Button>
      </span>
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
      <div className="flex flex-col gap-1"><Label htmlFor={`${targetId}-title`}>Stage name</Label><Input id={`${targetId}-title`} value={text('title')} onChange={(event) => setFields({ ...fields, title: event.target.value })} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor={`${targetId}-timing`}>Rough timing</Label><Input id={`${targetId}-timing`} value={text('timing')} onChange={(event) => setFields({ ...fields, timing: event.target.value })} placeholder="This fall, two weeks…" /></div>
    </div>
    <div className="flex flex-col gap-1"><Label htmlFor={`${targetId}-details`}>Details</Label><Textarea id={`${targetId}-details`} rows={2} value={text('description')} onChange={(event) => setFields({ ...fields, description: event.target.value })} /></div>
  </section>
}

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

/** A typed step Coach proposed, in the single step editor: review it, change it, then save or cancel. */
export function ProposedStepEditor({ goal, step, stageUuid, onStageChange, recovered, token, onSettled }: {
  goal: Goal; step: HubProposedStep; stageUuid: string; recovered?: HubEditObjectState; token?: string
  // eslint-disable-next-line no-unused-vars
  onStageChange: (stageUuid: string) => void
  // eslint-disable-next-line no-unused-vars
  onSettled: (localId: string, decision: string) => void
}) {
  const mode = liveMode(goal)
  const base = React.useMemo<StepDraft>(() => ({ type: step.type, title: step.title, description: step.description, config: step.config, completed_by: 'learner', review_required: false, reviewer_guidance: '', after: [], due_date: step.due_date || null }), [step])
  const proposal = React.useMemo(() => stepFields(base, stageUuid), [base]) // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = React.useState<StepDraft>(() => recoveredDraft(base, recovered?.current_fields))
  const [saving, setSaving] = React.useState(false)
  const { run } = useGoalMutation(goal.goal_uuid)
  const targetId = `hub-edit-step-${step.local_id}`
  const label = draft.title || step.title
  const persist = useRunObject(goal, step.local_id, 'step', recovered, token)
  const clearReview = useReviewItem(step.local_id, step.title, 'step', targetId)
  const current = stepFields(draft, stageUuid)
  usePersistWhileEditing(() => persist(current, proposal, 'editing', label), [draft, stageUuid])

  const cancel = async () => {
    setSaving(true)
    await persist(current, proposal, 'cancelled', label)
    clearReview(); setSaving(false)
    onSettled(step.local_id, `I cancelled step “${label}”. Review: ${review(current, proposal)}.`)
  }
  const save = async () => {
    if (!draft.title.trim()) return
    setSaving(true)
    try {
      const input = { ...stepInput(draft, mode), stage_uuid: stageUuid || null, materials: step.materials || [], request_key: step.local_id }
      const result = await run(() => goalCoachApi.addStep(goal.goal_uuid, input, token), 'Step added')
      await persist(current, proposal, 'saved', label, (result as { created_step_uuid?: string | null })?.created_step_uuid)
      clearReview()
      const stage = goal.stages.find((item) => item.stage_uuid === stageUuid)
      onSettled(step.local_id, `I saved step “${draft.title.trim()}” (${draft.type}) in ${stage ? `stage “${stage.title}”` : 'no stage'}; due ${draft.due_date || 'none'}; description “${draft.description.slice(0, 800)}”. Review: ${review(current, proposal)}.`)
    } catch { /* useGoalMutation already said what went wrong */ } finally { setSaving(false) }
  }

  return <article id={targetId} tabIndex={-1} aria-label={`Proposed step ${label}`} className="flex flex-col gap-4 rounded-2xl border-2 border-dashed border-violet-300 bg-card p-4 outline-none">
    <div className="flex flex-wrap items-center justify-between gap-2">{suggested}
      <span className="flex items-center gap-2">
        {goal.stages.length ? <select aria-label="Stage" value={stageUuid} onChange={(event) => onStageChange(event.target.value)} className="h-9 max-w-[12rem] rounded-xl border-2 border-border bg-background px-2 text-xs font-bold">
          {goal.stages.map((stage) => <option key={stage.stage_uuid} value={stage.stage_uuid}>{stage.title}</option>)}
          <option value="">No stage</option>
        </select> : null}
        <Button type="button" variant="ghost" size="icon" disabled={saving} onClick={() => void cancel()} aria-label={`Cancel step ${label}`}><X size={15} /></Button>
        <Button type="button" variant="plan" size="icon" disabled={saving || !draft.title.trim()} onClick={() => void save()} aria-label={`Save step ${label}`}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}</Button>
      </span>
    </div>
    <StepEditor value={draft} onChange={setDraft} mode={mode} others={otherSteps(goal)} orgId={goal.org_id} token={token} />
  </article>
}
