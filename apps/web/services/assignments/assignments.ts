import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { Chat, MessageAudience } from '@services/connect/connect'
import type { GoalIcon } from '@services/goals/types'

const q = encodeURIComponent
const base = (path = '') => `${getAPIUrl()}plan-assignments${path}`

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** A person as the assignments endpoints give them (services/goals/review.person). */
export interface AssignmentPerson {
  id: number
  user_uuid?: string
  username: string
  first_name?: string | null
  last_name?: string | null
  avatar_image?: string | null
}

/** Where a learner is on a step, in time order: complete, awaiting review, behind schedule, open, not open yet. */
export type StatusCategory = 'done' | 'review' | 'behind' | 'open' | 'locked'
export type StatusCounts = Record<StatusCategory, number>
/** What waits on staff: unread questions, work to review, and learners (or, per learner, steps) past due. */
export interface Needs { questions: number; review: number; behind: number }

export type AssignmentRole = 'lead' | 'review' | 'comment'
export type AssignmentStatus = 'active' | 'paused' | 'ended'

export type AssignmentTarget =
  | { type: 'group'; id: number; uuid: string | null; name: string }
  | { type: 'person'; person: AssignmentPerson | null; name: string }
  | { type: 'email'; email: string | null; name: string | null }

export interface AssignmentPlan {
  template_uuid: string
  title: string
  thumbnail_image?: string | null
  icon?: GoalIcon | null
  color?: string | null
  version: number | null
  /** The badge learners earn by finishing it. */
  badge?: { badge_uuid: string; name: string } | null
}

export interface AssignmentListItem {
  assignment_uuid: string
  target: AssignmentTarget
  plan: AssignmentPlan
  start_date: string | null
  due_date: string | null
  /** On a schedule (stage or step dates) rather than self-paced. */
  scheduled: boolean
  /** The stage running today on a scheduled assignment. */
  stage?: { position: number; title: string; of: number } | null
  status: AssignmentStatus
  paused_at: string | null
  ended_at: string | null
  creation_date: string
  learner_count: number
  step_count: number
  counts: StatusCounts
  needs: Needs
}

export interface AssignmentStaff { person: AssignmentPerson | null; role: AssignmentRole }

export interface AssignmentStep {
  key: string
  title: string
  type: string
  description: string
  completed_by: string
  review_required: boolean
  config: Record<string, any>
  materials: any[]
  staff_guide: string
  staff_materials: any[]
  reviewer_guidance: string
  start_date: string | null
  due_date: string | null
  /** Staff set dates on this step itself, rather than it following its stage. */
  own: boolean
  open_early: boolean
  allow_late: boolean
  counts: StatusCounts
  /** Learners' user ids in each category. */
  who: Record<StatusCategory, number[]>
  questions: number
}

export interface AssignmentStage {
  key: string
  title: string
  position: number
  start_date: string | null
  end_date: string | null
  counts: StatusCounts
  steps: AssignmentStep[]
}

export interface AssignmentDetail extends AssignmentListItem {
  welcome_message: string | null
  staff: AssignmentStaff[]
  can_manage: boolean
  can_change_version: boolean
  stages: AssignmentStage[]
  /** The learners, by user id, for the names behind a step's counts. */
  people: Record<string, AssignmentPerson>
  others: Array<{ assignment_uuid: string; plan: AssignmentPlan; target: AssignmentTarget; status: AssignmentStatus }>
}

export interface AssignmentLearner {
  person: AssignmentPerson | null
  email: string | null
  goal_uuid: string
  goal_status: string
  counts: StatusCounts
  needs: Needs
  progress_percent: number
  update_date: string
}

export interface AssignmentPeople { assignment_uuid: string; step_count: number; needs: Needs; learners: AssignmentLearner[] }

/** A learner's question about a step, from their own chat with the organization. */
export interface StepQuestion { person: AssignmentPerson | null; goal_uuid: string; message_uuid: string; body: string; creation_date: string }
/** A step the learner is past due on: shown in their messages, not stored. */
export interface PastDueLine { kind: 'past_due'; step_key: string; step_uuid: string; title: string; due_date: string | null }

export type AssignmentThread = Chat & { assignment_uuid: string; step_key: string | null; questions: StepQuestion[] }
export type LearnerThread = Chat & { assignment_uuid: string; goal_uuid: string; learner: AssignmentPerson | null; step_key: string | null; past_due: PastDueLine[] }

export interface MessagesFilter { step?: string | null; audience?: MessageAudience | null }

export interface StepScheduleSave { step_key: string; start_date?: string | null; due_date?: string | null; open_early?: boolean; allow_late?: boolean }
export interface ScheduleSave {
  start_date?: string | null
  due_date?: string | null
  stages?: Array<{ stage_key: string; start_date: string | null }>
  steps?: StepScheduleSave[]
}

const messagesQuery = (orgId: number, filter: MessagesFilter) => {
  const params = new URLSearchParams({ org_id: String(orgId) })
  if (filter.step) params.set('step', filter.step)
  if (filter.audience) params.set('audience', filter.audience)
  return `?${params.toString()}`
}

export const assignmentKeys = {
  list: (orgId: number) => base(`?org_id=${orgId}`),
  detail: (orgId: number, uuid: string) => base(`/${q(uuid)}?org_id=${orgId}`),
  people: (orgId: number, uuid: string) => base(`/${q(uuid)}/people?org_id=${orgId}`),
  thread: (orgId: number, uuid: string, filter: MessagesFilter = {}) => base(`/${q(uuid)}/messages${messagesQuery(orgId, filter)}`),
  learnerThread: (orgId: number, uuid: string, userUuid: string, filter: MessagesFilter = {}) =>
    base(`/${q(uuid)}/learners/${q(userUuid)}/messages${messagesQuery(orgId, filter)}`),
}

export const assignmentApi = {
  list: (orgId: number, token?: string) => request<AssignmentListItem[]>(assignmentKeys.list(orgId), token),
  detail: (orgId: number, uuid: string, token?: string) => request<AssignmentDetail>(assignmentKeys.detail(orgId, uuid), token),
  people: (orgId: number, uuid: string, token?: string) => request<AssignmentPeople>(assignmentKeys.people(orgId, uuid), token),
  thread: (orgId: number, uuid: string, token?: string, filter: MessagesFilter = {}) => request<AssignmentThread>(assignmentKeys.thread(orgId, uuid, filter), token),
  learnerThread: (orgId: number, uuid: string, userUuid: string, token?: string, filter: MessagesFilter = {}) =>
    request<LearnerThread>(assignmentKeys.learnerThread(orgId, uuid, userUuid, filter), token),
  saveSchedule: (orgId: number, uuid: string, schedule: ScheduleSave, token?: string) =>
    request(`${getAPIUrl()}goal-admin/assignments/${q(uuid)}/schedule?org_id=${orgId}`, token, 'PUT', schedule),
}
