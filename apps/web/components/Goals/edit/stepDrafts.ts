import type { StepInput } from '@services/goals/goals'
import type { Goal, Step } from '@services/goals/types'
import type { StepDraft, StepEditorMode } from './StepEditor'

/** The editor mode for steps on a live goal: a learner's own goal hides staff settings. */
export const liveMode = (goal: Goal): StepEditorMode => goal.ownership === 'personal' ? 'personal' : 'live'

export const dateValue = (value?: string | null) => value ? String(value).slice(0, 10) : ''

export function stepDraft(step: Step): StepDraft {
  return {
    type: step.type, title: step.title, description: step.description || '', config: step.config,
    completed_by: step.completed_by, review_required: step.review_required, reviewer_guidance: step.reviewer_guidance || '',
    after: step.after_step_uuids || [], start_date: dateValue(step.start_date) || null, due_date: dateValue(step.due_date) || null,
  }
}

/** A draft as the goal API takes it. A personal goal never waits on staff. */
export function stepInput(draft: StepDraft, mode: StepEditorMode): Omit<StepInput, 'stage_uuid' | 'position'> {
  const personal = mode === 'personal'
  return {
    type: draft.type, title: draft.title.trim(), description: draft.description, config: draft.config as unknown as Record<string, unknown>,
    completed_by: personal ? 'learner' : draft.completed_by, review_required: personal ? false : draft.review_required,
    reviewer_guidance: personal ? '' : draft.reviewer_guidance, after_step_uuids: draft.after,
    start_date: draft.start_date || null, due_date: draft.due_date || null,
  }
}

/** Only the fields that changed, so someone who can only reschedule can still save dates. */
export function stepChanges(before: StepDraft, after: StepDraft, mode: StepEditorMode) {
  const old = stepInput(before, mode)
  const next = stepInput(after, mode)
  const changes: Record<string, unknown> = {}
  for (const key of Object.keys(next) as Array<keyof typeof next>) {
    if (key !== 'type' && JSON.stringify(old[key] ?? null) !== JSON.stringify(next[key] ?? null)) changes[key] = next[key]
  }
  return changes as Partial<Omit<StepInput, 'type' | 'stage_uuid' | 'position'>>
}
