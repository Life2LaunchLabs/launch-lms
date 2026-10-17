import type { Goal, Stage, Step } from './types'

/**
 * When a step opens and closes, by the API's rules (services/goals/schedule.py): a stage runs
 * from its start until the next one starts, and a step opens and closes inside its stage unless
 * it has its own dates, or opens after another step. Dates are YYYY-MM-DD strings.
 */

const day = (value?: string | null) => (value ? String(value).slice(0, 10) : '')

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const allSteps = (goal: Goal): Step[] => [...goal.stages.flatMap((stage) => stage.steps), ...goal.unstaged_steps]

/** A stage's first and last day, where known: the first stage starts with the goal when it has no date. */
export function stageBounds(goal: Goal, stage?: Stage | null): { start: string; end: string } {
  if (!stage) return { start: '', end: day(goal.target_date) }
  const first = goal.stages[0]?.stage_uuid === stage.stage_uuid
  return { start: day(stage.start_date) || (first ? day(goal.start_date) : ''), end: day(stage.end_date) }
}

/** A date for a step's open or close that falls outside its stage, and how the plan would move to fit it instead. */
export type StageClash = {
  /** Where the date falls. */
  side: 'before' | 'after'
  /** The date the step would keep if it moves instead: its stage's edge. */
  stepDate: string
  /** The change that makes room: a new start for this stage or a later one, or a new goal target. */
  move: { kind: 'stage'; stage: Stage; start_date: string } | { kind: 'target'; target_date: string }
}

export function stageClash(goal: Goal, stage: Stage | null | undefined, date: string): StageClash | null {
  if (!stage || !date) return null
  const { start, end } = stageBounds(goal, stage)
  if (start && date < start) return { side: 'before', stepDate: start, move: { kind: 'stage', stage, start_date: date } }
  if (end && date > end) {
    const index = goal.stages.findIndex((item) => item.stage_uuid === stage.stage_uuid)
    const next = goal.stages.slice(index + 1).find((item) => item.start_date)
    return { side: 'after', stepDate: end, move: next ? { kind: 'stage', stage: next, start_date: addDays(date, 1) } : { kind: 'target', target_date: date } }
  }
  return null
}

/** Every step the given one waits on, directly or through others. */
export function waitsOn(goal: Goal, stepUuid: string): Set<string> {
  const byUuid = new Map(allSteps(goal).map((step) => [step.step_uuid, step]))
  const seen = new Set<string>()
  const pending = [...(byUuid.get(stepUuid)?.after_step_uuids || [])]
  while (pending.length) {
    const uuid = pending.pop() as string
    if (seen.has(uuid) || !byUuid.has(uuid)) continue
    seen.add(uuid)
    pending.push(...(byUuid.get(uuid)?.after_step_uuids || []))
  }
  return seen
}

export type AfterChoice = { step: Step; stage: Stage | null; reason: string | null }

/**
 * The steps a step could open after, each with why it can't when it can't: it comes in a later
 * stage, it already waits on this one, or it opens after this one closes.
 */
export function afterChoices(goal: Goal, stageUuid: string | null, stepUuid?: string, closes?: string | null): AfterChoice[] {
  const rank = new Map(goal.stages.map((stage, index) => [stage.stage_uuid, index]))
  const here = stageUuid ? rank.get(stageUuid) : undefined
  const listed: Array<{ step: Step; stage: Stage | null }> = [
    ...goal.stages.flatMap((stage) => stage.steps.map((step) => ({ step, stage }))),
    ...goal.unstaged_steps.map((step) => ({ step, stage: null })),
  ]
  return listed.filter(({ step }) => step.step_uuid !== stepUuid).map(({ step, stage }) => {
    const there = stage ? rank.get(stage.stage_uuid) : undefined
    let reason: string | null = null
    if (here !== undefined && there !== undefined && there > here) reason = `Comes in a later stage, ${stage?.title}`
    else if (stepUuid && waitsOn(goal, step.step_uuid).has(stepUuid)) reason = 'Already waits on this step'
    else if (closes && day(step.start_date) && day(step.start_date) > day(closes)) reason = 'Opens after this one closes'
    return { step, stage, reason }
  })
}
