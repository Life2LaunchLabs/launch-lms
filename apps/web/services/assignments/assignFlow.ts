import type { GoalAssignmentRequest } from '@services/goals/templates'
import type { TemplateDocument } from '@services/goals/types'
import type { AssignmentListItem, AssignmentRole } from './assignments'
import type { StepDates } from './status'

/**
 * The assign flow's state and rules, apart from its screens: who it's for, the schedule, the
 * staff and the message become one assignment request per pick.
 */

/** Someone or something the plan goes to; each becomes its own assignment. */
export type Recipient =
  | { kind: 'group'; id: number; name: string; count: number }
  | { kind: 'newgroup'; name: string }
  | { kind: 'member'; id: number; name: string; email?: string | null; avatar_image?: string | null; user_uuid?: string; username: string }
  | { kind: 'email'; email: string }

export const recipientKey = (pick: Recipient) => pick.kind === 'email' ? `email:${pick.email}` : pick.kind === 'newgroup' ? `newgroup:${pick.name.toLowerCase()}` : `${pick.kind}:${pick.id}`
export const recipientName = (pick: Recipient) => pick.kind === 'email' ? pick.email : pick.name

export const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())

export interface StaffPick { id: number; name: string; role: AssignmentRole; avatar_image?: string | null; user_uuid?: string; username: string; you?: boolean }

export const ROLES: Record<AssignmentRole, string> = { lead: 'Lead', review: 'Review', comment: 'Comment' }
export const ROLE_DO: Record<AssignmentRole, string> = {
  lead: 'Changes dates, learners and settings. Reviews work.',
  review: 'Reviews work and messages learners.',
  comment: 'Messages learners and sees progress.',
}

export type Pacing = 'pace' | 'sched'
export interface FlowSchedule {
  mode: Pacing
  start: string
  end: string
  /** Self-paced only: whether there's an end date at all. */
  hasEnd: boolean
  /** Each stage's start date, in stage order; the first is the assignment's start. */
  starts: string[]
  /** Steps' own dates and switches, by step key. */
  steps: Record<string, StepDates>
}

export const FLOW_STEPS = ['Who', 'Schedule', 'Staff', 'Message', 'Review'] as const

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const todayIso = () => iso(new Date())
export function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return iso(date)
}

/** A first schedule: stages back to back from the start, by their length in weeks (one when they have none), ending the day before the next would start. */
export function defaultSchedule(document: Pick<TemplateDocument, 'stages'>, start = todayIso()): FlowSchedule {
  let at = start
  const starts = document.stages.map((stage) => { const day = at; at = addDays(at, Math.max(1, Number(stage.duration_weeks || 1)) * 7); return day })
  return { mode: 'pace', start, end: addDays(at, -1), hasEnd: false, starts, steps: {} }
}

/** Moving the start moves every stage with it, keeping their spacing. */
export function moveStart(schedule: FlowSchedule, start: string): FlowSchedule {
  if (!start) return schedule
  const shift = Math.round((new Date(`${start}T12:00:00`).getTime() - new Date(`${schedule.starts[0] || schedule.start}T12:00:00`).getTime()) / 86_400_000)
  return { ...schedule, start, starts: schedule.starts.map((day, index) => index === 0 ? start : day ? addDays(day, shift) : day) }
}

/** What keeps the flow from going on, or null. */
export function scheduleProblem(schedule: FlowSchedule): string | null {
  if (!schedule.start) return 'Recipient a start date.'
  if (schedule.mode === 'sched') {
    if (!schedule.end) return 'A schedule needs an end date.'
    const starts = schedule.starts.filter(Boolean)
    if (starts.some((day, index) => index > 0 && day < starts[index - 1])) return 'Stages have to start in order.'
    if (starts.length && schedule.end < starts[starts.length - 1]) return 'The end comes before the last stage starts.'
    for (const dates of Object.values(schedule.steps)) if (dates.start_date && dates.due_date && dates.due_date < dates.start_date) return 'A step is due before it starts.'
  } else if (schedule.hasEnd && schedule.end && schedule.end < schedule.start) return 'The end comes before the start.'
  return null
}

export const staffProblem = (staff: StaffPick[]) => staff.some((item) => item.role === 'lead') ? null : 'Make at least one person Lead. A Lead doesn’t have to be an admin.'

/** The request every pick shares: dates, staff and message. */
export function baseRequest(document: Pick<TemplateDocument, 'stages'>, schedule: FlowSchedule, staff: StaffPick[], welcome: string): GoalAssignmentRequest {
  const scheduled = schedule.mode === 'sched'
  const start = scheduled ? schedule.starts[0] || schedule.start : schedule.start
  return {
    start_date: start,
    due_date: scheduled || schedule.hasEnd ? schedule.end || null : null,
    welcome_message: welcome,
    staff_user_ids: staff.map((item) => item.id),
    collaborators: staff.map((item) => ({ user_id: item.id, role_key: item.role })),
    schedule: scheduled ? {
      stages: document.stages.map((stage, index) => ({ stage_key: String(stage.key), start_date: schedule.starts[index] || null })),
      steps: Object.entries(schedule.steps).filter(([, dates]) => dates.start_date || dates.due_date || dates.open_early === false || dates.allow_late === false)
        .map(([step_key, dates]) => ({ step_key, start_date: dates.start_date || null, due_date: dates.due_date || null, open_early: dates.open_early !== false, allow_late: dates.allow_late !== false })),
    } : null,
  }
}

/** One pick's request, once any new group exists (newGroups maps a new group's key to its id). */
export function requestFor(pick: Recipient, base: GoalAssignmentRequest, newGroups: Record<string, number> = {}): GoalAssignmentRequest {
  if (pick.kind === 'group') return { ...base, usergroup_id: pick.id }
  if (pick.kind === 'newgroup') return { ...base, usergroup_id: newGroups[recipientKey(pick)] }
  if (pick.kind === 'member') return { ...base, user_id: pick.id }
  return { ...base, subject_email: pick.email.trim().toLowerCase() }
}

/** Groups and people that already run this plan: Who shows them but won't add them again. */
export function alreadyOn(assignments: AssignmentListItem[], templateUuid: string) {
  const groups = new Set<number>()
  const people = new Set<number>()
  for (const item of assignments) {
    if (item.plan.template_uuid !== templateUuid || item.status === 'ended') continue
    if (item.target.type === 'group') groups.add(item.target.id)
    if (item.target.type === 'person' && item.target.person) people.add(item.target.person.id)
  }
  return { groups, people }
}
