import type { StepDraft } from '@components/Goals/edit/StepEditor'
import type { StepMaterial, TemplateDocument, TemplateStage, TemplateStep } from '@services/goals/types'

// Pure edits on a template document. The editor always saves the whole document.

/** A stable key made on the client, so new steps can wait on each other before the first save. */
export const newKey = (prefix: 'stage' | 'step') => `${prefix}_${(globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`

export const documentSteps = (document: TemplateDocument) => document.stages.flatMap((stage) => stage.steps.map((step) => ({ stage, step })))

export const stepChoices = (document: TemplateDocument, exceptKey?: string) =>
  documentSteps(document).filter(({ step }) => step.key && step.key !== exceptKey).map(({ step }) => ({ id: step.key as string, title: step.title }))

export function stepToDraft(step: TemplateStep): StepDraft {
  return {
    type: step.type, title: step.title, description: step.description || '', config: step.config, completed_by: step.completed_by || 'learner',
    review_required: !!step.review_required, reviewer_guidance: step.reviewer_guidance || '', after: step.after || [], due_week: step.due_week ?? null,
    materials: (step.materials || []) as unknown as StepMaterial[], staff_guide: step.staff_guide || '', staff_materials: step.staff_materials || [],
  }
}

export function draftToStep(draft: StepDraft, previous?: TemplateStep): TemplateStep {
  return {
    ...(previous || { key: newKey('step'), materials: [], requirement_node_uuids: [] }),
    type: draft.type, title: draft.title.trim(), description: draft.description, config: draft.config, completed_by: draft.completed_by,
    review_required: draft.completed_by === 'learner' && draft.review_required, reviewer_guidance: draft.reviewer_guidance, after: draft.after, due_week: draft.due_week ?? null,
    materials: (draft.materials || []) as unknown as TemplateStep['materials'], staff_guide: (draft.staff_guide || '').trim(), staff_materials: draft.staff_materials || [],
  }
}

const withoutRefs = (document: TemplateDocument, removed: Set<string>): TemplateDocument => ({
  ...document,
  stages: document.stages.map((stage) => ({ ...stage, steps: stage.steps.map((step) => ({ ...step, after: (step.after || []).filter((key) => !removed.has(key)) })) })),
})

export const mapStage = (document: TemplateDocument, stageKey: string, change: (stage: TemplateStage) => TemplateStage): TemplateDocument => // eslint-disable-line no-unused-vars
  ({ ...document, stages: document.stages.map((stage) => stage.key === stageKey ? change(stage) : stage) })

export const mapStep = (document: TemplateDocument, stepKey: string, change: (step: TemplateStep) => TemplateStep): TemplateDocument => // eslint-disable-line no-unused-vars
  ({ ...document, stages: document.stages.map((stage) => ({ ...stage, steps: stage.steps.map((step) => step.key === stepKey ? change(step) : step) })) })

export const addStage = (document: TemplateDocument, title: string, durationWeeks: number | null): TemplateDocument =>
  ({ ...document, stages: [...document.stages, { key: newKey('stage'), title: title.trim(), description: '', timing: '', duration_weeks: durationWeeks, steps: [] }] })

export function removeStage(document: TemplateDocument, stageKey: string): TemplateDocument {
  const stage = document.stages.find((item) => item.key === stageKey)
  const removed = new Set((stage?.steps || []).map((step) => step.key || ''))
  return withoutRefs({ ...document, stages: document.stages.filter((item) => item.key !== stageKey) }, removed)
}

export const addStep = (document: TemplateDocument, stageKey: string, step: TemplateStep): TemplateDocument => mapStage(document, stageKey, (stage) => ({ ...stage, steps: [...stage.steps, step] }))

/** Puts a step at ``index`` in a stage (the end when past it). */
export const insertStep = (document: TemplateDocument, stageKey: string, index: number, step: TemplateStep): TemplateDocument =>
  mapStage(document, stageKey, (stage) => ({ ...stage, steps: [...stage.steps.slice(0, index), step, ...stage.steps.slice(index)] }))

export const removeStep = (document: TemplateDocument, stepKey: string): TemplateDocument =>
  withoutRefs({ ...document, stages: document.stages.map((stage) => ({ ...stage, steps: stage.steps.filter((step) => step.key !== stepKey) })) }, new Set([stepKey]))

export function moveStage(document: TemplateDocument, from: number, to: number): TemplateDocument {
  const stages = [...document.stages]
  const [moved] = stages.splice(from, 1)
  stages.splice(to, 0, moved)
  return { ...document, stages }
}

export function moveStep(document: TemplateDocument, fromStage: string, fromIndex: number, toStage: string, toIndex: number): TemplateDocument {
  const stages = document.stages.map((stage) => ({ ...stage, steps: [...stage.steps] }))
  const source = stages.find((stage) => stage.key === fromStage)
  const target = stages.find((stage) => stage.key === toStage)
  if (!source || !target) return document
  const [moved] = source.steps.splice(fromIndex, 1)
  target.steps.splice(toIndex, 0, moved)
  return { ...document, stages }
}
