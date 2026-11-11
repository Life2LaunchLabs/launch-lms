import type { EntryInput } from '@services/goals/goals'
import type { Goal, GoalIcon, LockReason, NodeState, Stage, Step, StepEntry, StepStatus, TemplateDocument, TemplateStep } from '@services/goals/types'

/**
 * Preview: a plan as someone assigned it would get it, built in the browser from the plan's
 * document. Whatever the viewer does in it lives in `PreviewWork` and is never sent anywhere.
 */

/** What the viewer has done to one step while previewing. */
export type StepWork = { status: StepStatus; submission: Record<string, unknown>; answer: string; learner_note: string; entries: StepEntry[] }
/** Everything done in the preview, by step key. */
export type PreviewWork = Record<string, StepWork>

const BLANK: StepWork = { status: 'not_started', submission: {}, answer: '', learner_note: '', entries: [] }
const DONE: StepStatus[] = ['completed', 'excused']
// A step handed in for review counts as finished for unlocking what follows, as on a real plan.
const UNLOCKING: StepStatus[] = [...DONE, 'submitted']
const UNDER_WAY: StepStatus[] = ['in_progress', 'submitted', 'changes_requested']

/** A step's key in the preview: its own key, else its place in the plan. */
export const stepKey = (step: TemplateStep, stageIndex: number, stepIndex: number) => step.key || `preview-${stageIndex}-${stepIndex}`
/** Step uuids in the preview are made up, so nothing can mistake them for a real step. */
const stepUuid = (key: string) => `preview-step-${key}`
const stageUuid = (index: number) => `preview-stage-${index}`

/** What a node shows, as availability.node_state does on the server. */
function nodeState(status: StepStatus, locked: boolean): NodeState {
  if (DONE.includes(status)) return 'done'
  if (status === 'submitted') return 'waiting'
  if (status === 'changes_requested') return 'retry'
  if (locked) return 'locked'
  return status === 'in_progress' ? 'started' : 'open'
}

/**
 * The status a step lands on when the viewer finishes it: one that needs review waits for it.
 * Nobody reviews in the preview, so it stays handed in.
 */
export function finishedStatus(step: Pick<TemplateStep, 'review_required'>, status: StepStatus): StepStatus {
  return status === 'completed' && step.review_required ? 'submitted' : status
}

type PreviewOptions = {
  document: TemplateDocument
  orgId: number
  /** The plan's own icon, for the header's mark. */
  icon?: GoalIcon | null
  work: PreviewWork
  /** The stage the preview is on; later stages stay closed, as they would until the plan reaches them. */
  stageIndex: number
}

/** The plan as a goal on its first day: stages and steps from the document, locks worked out like the server's. */
export function previewGoal({ document, orgId, icon, work, stageIndex }: PreviewOptions): Goal {
  const stages = document.stages || []
  const current = Math.min(Math.max(stageIndex, 0), Math.max(stages.length - 1, 0))
  const keyed = stages.map((stage, si) => stage.steps.map((step, ti) => ({ step, key: stepKey(step, si, ti), si, ti })))
  const byKey = new Map(keyed.flat().map((item) => [item.key, item]))
  const statusOf = (key: string) => (work[key] || BLANK).status

  const lockOf = (item: { step: TemplateStep; key: string; si: number }): LockReason | null => {
    const status = statusOf(item.key)
    if (DONE.includes(status) || UNDER_WAY.includes(status)) return null
    if (item.si > current) return { kind: 'stage', title: stages[item.si].title, date: null }
    for (const after of item.step.after || []) {
      const waiting = byKey.get(after)
      if (waiting && waiting.key !== item.key && !UNLOCKING.includes(statusOf(waiting.key))) return { kind: 'after', step_uuid: stepUuid(waiting.key), title: waiting.step.title }
    }
    return null
  }

  const toStep = (item: { step: TemplateStep; key: string; si: number; ti: number }): Step => {
    const own = work[item.key] || BLANK
    const reason = lockOf(item)
    const done = DONE.includes(own.status)
    return {
      step_uuid: stepUuid(item.key), stage_uuid: stageUuid(item.si), position: item.ti, type: item.step.type, title: item.step.title, description: item.step.description || '',
      config: item.step.config, materials: item.step.materials || [], completed_by: item.step.completed_by, review_required: !!item.step.review_required,
      start_date: null, due_date: null, held: false, after_step_uuids: (item.step.after || []).filter((key) => byKey.has(key)).map(stepUuid), requirement_links: [],
      status: own.status, locked: reason !== null, locked_reason: reason, state: nodeState(own.status, reason !== null), fraction: done ? 1 : 0, result: null,
      submission: own.submission, answer: own.answer, learner_note: own.learner_note, reviewer_note: '', feedback_history: [],
      completed_at: done ? new Date().toISOString() : null, completion_method: done ? 'learner' : null, entries: own.entries, reference: null,
    }
  }

  const goalStages: Stage[] = stages.map((stage, si) => ({
    stage_uuid: stageUuid(si), position: si, title: stage.title, description: stage.description || '', timing: stage.timing || '', milestone: '',
    start_date: null, end_date: null, steps: keyed[si].map(toStep),
  }))
  const all = goalStages.flatMap((stage) => stage.steps)
  return {
    goal_uuid: 'preview', title: document.template.title || 'Untitled plan', description: document.template.description || '', icon: icon || null,
    ownership: 'external', source: 'assignment', status: 'active', org_id: orgId, start_date: null, target_date: null, finished_at: null, finish: {},
    owner: null, subject: null,
    // Only enough to read it: the preview's own controls do the work, so nothing in the shared path can save.
    capabilities: ['view_plan'],
    progress: { done: all.filter((step) => step.state === 'done').length, total: all.length },
    stages: goalStages, unstaged_steps: [], current_stage_uuid: goalStages.length ? stageUuid(current) : null, schedule_warnings: [],
  }
}

/** The preview's key for a step uuid it made. */
export const keyOfStep = (uuid: string) => uuid.replace(/^preview-step-/, '')

let made = 0
/** One change the viewer makes to one step, applied to the preview's work. */
export type WorkChange =
  | { kind: 'status'; status: StepStatus }
  | { kind: 'submission'; submission?: Record<string, unknown>; answer?: string; learner_note?: string }
  | { kind: 'note'; note: string }
  | { kind: 'add-entry'; entry: EntryInput }
  | { kind: 'update-entry'; entryUuid: string; data: { title?: string; note?: string; done?: boolean; data?: Record<string, unknown> } }
  | { kind: 'delete-entry'; entryUuid: string }

export function applyWork(work: PreviewWork, key: string, change: WorkChange): PreviewWork {
  const own = work[key] || BLANK
  let next: StepWork = own
  if (change.kind === 'status') next = { ...own, status: change.status }
  else if (change.kind === 'submission') next = {
    ...own, submission: change.submission ?? own.submission, answer: change.answer ?? own.answer, learner_note: change.learner_note ?? own.learner_note,
    status: own.status === 'not_started' ? 'in_progress' : own.status,
  }
  else if (change.kind === 'note') next = { ...own, learner_note: change.note }
  else if (change.kind === 'add-entry') {
    made += 1
    const entry: StepEntry = {
      entry_uuid: `preview-entry-${made}`, kind: change.entry.kind, slot: change.entry.slot ?? null, title: change.entry.title || '', url: change.entry.url || '',
      asset_id: null, resource_uuid: change.entry.resource_uuid ?? null, note: change.entry.note || '', done: false, period_start: null,
      data: change.entry.data || {}, creation_date: new Date().toISOString(),
    }
    next = { ...own, entries: [...own.entries, entry], status: own.status === 'not_started' ? 'in_progress' : own.status }
  } else if (change.kind === 'update-entry') next = { ...own, entries: own.entries.map((entry) => entry.entry_uuid === change.entryUuid ? { ...entry, ...change.data, data: change.data.data ?? entry.data } : entry) }
  else next = { ...own, entries: own.entries.filter((entry) => entry.entry_uuid !== change.entryUuid) }
  return { ...work, [key]: next }
}
