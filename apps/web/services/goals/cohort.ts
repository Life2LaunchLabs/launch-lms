/**
 * An assignment as staff read it: its template's plan with each step counted across learners,
 * what's left for staff on each step, and where each learner stands. Pure, so screens and tests
 * share it; everything comes from the assignment matrix (goal-admin/assignments/{a}/matrix).
 */
import type { ChatAudience } from '../connect/connect'
import type { AssignmentMatrix, AssignmentSummary, MatrixCell, MatrixColumn, MatrixLearner, MatrixStage, StepAggregate } from './admin'
import type { Goal, NodeState, Stage, Step } from './types'

/** A reminder goes out to the same learner at most this often (the API's REMIND_COOLDOWN). */
const REMIND_COOLDOWN_MS = 20 * 60 * 60 * 1000

/** A day as the API writes dates: 2026-10-19, in local time. */
export function dayOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const DONE = new Set(['completed', 'excused'])

/** One step across the cohort, in the counts the plan's rows show. Anything handed in waits on staff to grade it. */
function stepAggregate(column: MatrixColumn): StepAggregate {
  const counts = column.aggregate
  const waiting = (counts.handed_in_count || 0) + (counts.to_grade_count || 0)
  return { total: counts.learner_count, done: counts.done_count || 0, handed_in: waiting, to_grade: waiting, not_handed_in: counts.not_handed_in_count || 0, to_settle: counts.needs_settle_count || 0 }
}

/** The day a step closes for most of the cohort: the assignment's date, unless staff moved it for someone. */
export function closeDate(column: MatrixColumn, learners: MatrixLearner[]) {
  const counts = new Map<string, number>()
  for (const learner of learners) {
    const due = learner.cells[column.template_key]?.due_date
    if (due) counts.set(due, (counts.get(due) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null
}

/** The stage the cohort is on: the last whose start date has come, else the first. */
export function currentStage(stages: MatrixStage[], today: string) {
  const started = stages.filter((stage) => stage.start_date && stage.start_date <= today)
  return started.at(-1) || stages[0] || null
}

function cohortNode(aggregate: StepAggregate): { state: NodeState; fraction: number } {
  if (aggregate.total && aggregate.done >= aggregate.total) return { state: 'done', fraction: 1 }
  return { state: aggregate.done || aggregate.handed_in ? 'started' : 'open', fraction: aggregate.total ? aggregate.done / aggregate.total : 0 }
}

function templateStep(column: MatrixColumn, stage: MatrixStage, position: number, learners: MatrixLearner[]): Step {
  const node = cohortNode(stepAggregate(column))
  return {
    step_uuid: column.template_key, stage_uuid: stage.stage_key, position, type: column.type, title: column.title, description: column.description,
    config: column.config as never, materials: column.materials || [], completed_by: column.completed_by, review_required: column.review_required,
    start_date: null, due_date: closeDate(column, learners), held: false, after_step_uuids: [], requirement_links: [],
    status: 'not_started', locked: false, locked_reason: null, state: node.state, fraction: node.fraction, result: null, submission: {}, answer: '',
    learner_note: '', reviewer_note: '', feedback_history: [], completed_at: null, completion_method: null, entries: [], reference: null,
    reviewer_guidance: column.reviewer_guidance,
  }
}

/**
 * The assignment's plan in the shape the learner's path draws: the template's stages and steps,
 * keyed by template key, dated by the assignment's schedule. Nobody's progress is on it; the
 * counts come in as aggregates.
 */
export function cohortPlan(matrix: AssignmentMatrix, today: string): Goal {
  const stages: Stage[] = matrix.stages.map((stage) => ({
    stage_uuid: stage.stage_key, position: stage.position, title: stage.title, description: '', timing: '', milestone: '',
    start_date: stage.start_date, end_date: stage.due_date, steps: stage.steps.map((column, index) => templateStep(column, stage, index, matrix.learners)),
  }))
  const steps = stages.flatMap((stage) => stage.steps)
  const summary = matrix.assignment
  return {
    goal_uuid: `assignment:${summary.assignment_uuid}`, title: summary.template_title, description: '', icon: null,
    ownership: 'external', source: 'assignment', status: 'active', org_id: null,
    start_date: summary.start_date, target_date: summary.due_date, finished_at: null, finish: {},
    owner: null, subject: null, capabilities: ['view_plan'],
    progress: { done: steps.filter((step) => step.state === 'done').length, total: steps.length },
    current_stage_uuid: currentStage(matrix.stages, today)?.stage_key || null,
    stages, unstaged_steps: [],
  }
}

/** Every step's counts by template key, for the plan's rows. */
export function cohortAggregates(matrix: AssignmentMatrix) {
  return Object.fromEntries(matrix.stages.flatMap((stage) => stage.steps.map((column) => [column.template_key, stepAggregate(column)])))
}

/** What's left for staff on one step: grading, settling who came, reminding who hasn't handed it in. */
export type StepTodo = {
  /** Handed in and waiting on a grade. */
  grade: number
  /** Learners a staff-confirmed step isn't settled for yet. */
  settle: string[]
  /** Learners who haven't handed it in, and those of them who can be reminded now. */
  waiting: string[]
  remindable: string[]
  /** Everyone is done. */
  clear: boolean
}

export function stepTodo(column: MatrixColumn, learners: MatrixLearner[], now: Date): StepTodo {
  const counts = column.aggregate
  const buckets = counts.buckets || { done: [], handed_in: [], to_grade: [], not_handed_in: [], needs_settle: [] }
  const byUuid = new Map(learners.filter((learner) => learner.user_uuid).map((learner) => [learner.user_uuid!, learner]))
  const recently = (uuid: string) => {
    const stamp = byUuid.get(uuid)?.cells[column.template_key]?.last_reminded_at
    return Boolean(stamp && now.getTime() - new Date(stamp).getTime() < REMIND_COOLDOWN_MS)
  }
  const waiting = buckets.not_handed_in || []
  return {
    grade: (counts.handed_in_count || 0) + (counts.to_grade_count || 0),
    settle: column.completed_by === 'staff' ? buckets.needs_settle || [] : [],
    waiting,
    remindable: waiting.filter((uuid) => !recently(uuid)),
    clear: counts.learner_count > 0 && (counts.done_count || 0) >= counts.learner_count,
  }
}

/** The next step nothing has happened on yet: what staff prepare for. */
export function upcomingStep(matrix: AssignmentMatrix) {
  return matrix.stages.flatMap((stage) => stage.steps).find((column) => {
    const counts = column.aggregate
    return !counts.done_count && !counts.handed_in_count && !counts.to_grade_count && !counts.not_handed_in_count && !counts.needs_settle_count
  }) || null
}

/** Where the plan opens: the first step waiting on staff, else the one coming up. */
export function firstToDo(matrix: AssignmentMatrix, now: Date) {
  const columns = matrix.stages.flatMap((stage) => stage.steps)
  const busy = columns.find((column) => { const todo = stepTodo(column, matrix.learners, now); return todo.grade || todo.settle.length })
  return (busy || upcomingStep(matrix))?.template_key || ''
}

// One learner across the plan --------------------------------------------------------------

/** A learner's step as a dot: done, waiting on staff, needs another go, past its close date, open, or not open yet. */
export type Dot = 'done' | 'waiting' | 'retry' | 'late' | 'open' | 'locked'

export function dotOf(cell: MatrixCell | undefined, stage: Pick<MatrixStage, 'start_date'>, today: string): Dot {
  if (!cell) return 'locked'
  if (DONE.has(cell.status)) return 'done'
  if (cell.status === 'submitted' || cell.bucket === 'handed_in' || cell.bucket === 'to_grade') return 'waiting'
  if (cell.status === 'changes_requested') return 'retry'
  if (cell.due_date && cell.due_date < today && !cell.held) return 'late'
  if (cell.locked || cell.held || (stage.start_date && stage.start_date > today)) return 'locked'
  return 'open'
}

export type Pace = { pace: 'ahead' | 'on_pace' | 'behind'; late: number }

/** Behind with any step past its close date; ahead with anything done in a stage still to come. */
export function paceOf(learner: MatrixLearner, stages: MatrixStage[], today: string): Pace {
  let late = 0
  let ahead = false
  for (const stage of stages) for (const column of stage.steps) {
    const dot = dotOf(learner.cells[column.template_key], stage, today)
    if (dot === 'late') late += 1
    if (dot === 'done' && stage.start_date && stage.start_date > today) ahead = true
  }
  return { pace: late ? 'behind' : ahead ? 'ahead' : 'on_pace', late }
}

export function paceLabel({ pace, late }: Pace) {
  if (pace === 'behind') return `Behind · ${late} step${late === 1 ? '' : 's'}`
  return pace === 'ahead' ? 'Ahead' : 'On pace'
}

/** What needs attention on a learner's plan, most pressing first: a hand-in to grade, a step sent back, then late steps. */
export function attentionOf(learner: MatrixLearner, stages: MatrixStage[], today: string): { tone: 'waiting' | 'retry' | 'late'; text: string } | null {
  const steps = stages.flatMap((stage) => stage.steps.map((column) => ({ column, dot: dotOf(learner.cells[column.template_key], stage, today) })))
  const waiting = steps.find((item) => item.dot === 'waiting')
  if (waiting) return { tone: 'waiting', text: `Handed in: ${waiting.column.title}` }
  const retry = steps.find((item) => item.dot === 'retry')
  if (retry) return { tone: 'retry', text: `Sent back: ${retry.column.title}` }
  const late = steps.filter((item) => item.dot === 'late')
  if (late.length) return { tone: 'late', text: late.length === 1 ? `Past close: ${late[0].column.title}` : `${late.length} steps past close` }
  return null
}

/** Learners who need the most help first: most steps late, then the rest by name. */
export function byNeed(learners: MatrixLearner[], stages: MatrixStage[], today: string, name: (person: MatrixLearner) => string) { // eslint-disable-line no-unused-vars
  const late = new Map(learners.map((learner) => [learner.goal_uuid, paceOf(learner, stages, today).late]))
  return [...learners].sort((a, b) => (late.get(b.goal_uuid) || 0) - (late.get(a.goal_uuid) || 0) || name(a).localeCompare(name(b)))
}

/** Who else is on a learner's plan, leaving out the assignment's own staff. */
export function helpersOf(learner: MatrixLearner, staffIds: number[]) {
  return (learner.people || []).filter((person) => !staffIds.includes(person.id))
}

/**
 * The chats an assignment's plan talks in: Staff only for every assignment, and Whole group for
 * a group's (groups come with the Full plan's user management). One person's assignment has no
 * group to talk with: its learner talks with staff in their own chat with the organization.
 */
export function cohortAudiences(assignment: Pick<AssignmentSummary, 'assignment_type'>): ChatAudience[] {
  return assignment.assignment_type === 'group' ? ['staff', 'group'] : ['staff']
}
