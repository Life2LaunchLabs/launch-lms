import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PersonSummary } from '@services/goals/types'
import type { HelperRequest, OrgRole } from '@services/school/people'
import type { JoinRequest } from '@services/goals/planJoining'

const q = encodeURIComponent
const base = (orgId: number, path: string) => `${getAPIUrl()}school/orgs/${orgId}/threads${path}`

async function request<T = any>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader('GET', null, null, token))
  return errorHandling(response)
}

/** What a thread can be narrowed to beside its plan and step: what waits on staff, or staff-only notes. */
export type ThreadFilter = 'all' | 'review' | 'questions' | 'requests' | 'past_due' | 'staff_only'
export type ThreadCounts = Record<Exclude<ThreadFilter, 'all'>, number>

export interface PlanCover { template_uuid: string; thumbnail_image: string | null; icon: string | null; color: string | null }

/** A plan a learner's thread covers, or an assignment a group's does, with how much waits on staff in it. */
export interface ThreadPlan {
  goal_uuid?: string
  assignment_uuid: string | null
  title: string
  status: 'active' | 'paused' | 'ended' | string
  cover: PlanCover | null
  needs: number
  group_id?: number | null
  /** A group's assignment: its chat with the whole group. */
  chat_uuid?: string | null
}

export type StepState = 'open' | 'started' | 'review' | 'changes' | 'done' | 'approved' | 'excused'
export interface ThreadStep {
  step_uuid: string
  step_key: string | null
  title: string
  type: string
  due_date: string | null
  state: StepState
  by_person: PersonSummary | null
  /** How many thread entries are about it. */
  updates: number
}

export interface ReviewItem { goal_uuid: string; assignment_uuid: string | null; step_uuid: string; step_key: string | null; title: string; submitted_at: string }
export interface QuestionItem { message_uuid: string; goal_uuid: string | null; step_uuid: string | null }
export interface PastDueItem { step_key: string; step_uuid?: string; title: string; due_date: string | null; goal_uuid?: string; assignment_uuid: string; learners?: PersonSummary[] }
export type ThreadRequest = HelperRequest & { goal_uuid: string }

/** A learner's thread as staff see it; with a staff member it's your direct chat, with no plans. */
export interface PersonThread {
  kind: 'learner' | 'staff'
  person: PersonSummary
  role: OrgRole
  chat_uuid: string | null
  /** Who else is on it, you first. */
  with: PersonSummary[]
  plans: ThreadPlan[]
  focus: string | null
  steps: ThreadStep[]
  counts: ThreadCounts
  review: ReviewItem[]
  questions: QuestionItem[]
  requests: ThreadRequest[]
  /** Plans they asked for in Discover, waiting on an answer (for staff who decide). */
  plan_requests: JoinRequest[]
  past_due: PastDueItem[]
}

export interface AskedItem { step_key: string | null; title: string; learners: PersonSummary[] }
export interface GroupThread {
  kind: 'group'
  group: { id: number; name: string; learner_count: number }
  chat_uuid: string | null
  /** Why there's no group chat here, when there isn't. */
  chat_note: string | null
  with: PersonSummary[]
  plans: ThreadPlan[]
  focus: string | null
  counts: ThreadCounts
  past_due: PastDueItem[]
  /** On a focused assignment: per step, who asked about it in their own thread and is still waiting. */
  asked: AskedItem[]
}

export interface StaffRoomThread { kind: 'staff_room'; title: string; chat_uuid: string; with: PersonSummary[]; counts: ThreadCounts }

export type OrgLogEntry =
  | { kind: 'org_created'; at: string; org: { name: string } }
  | { kind: 'staff_joined'; at: string; person: PersonSummary | null; role: 'admin' | 'staff' }
  | { kind: 'learners_joined'; at: string; count: number; people: PersonSummary[] }
  | { kind: 'invited'; at: string; role: 'staff' | 'learner'; count: number; by: PersonSummary | null; pending: number }
  /** Asking another organization to run its plan (incoming: they asked you), and the answer. */
  | { kind: 'plan_asked'; at: string; incoming: boolean; org: { name: string }; plan: string }
  | { kind: 'plan_answered'; at: string; incoming: boolean; org: { name: string }; plan: string; approved: boolean }
export interface OrgThread { kind: 'org'; org: { id: number; name: string; slug: string; logo_image: string | null }; can_post: false; entries: OrgLogEntry[] }

const focusQuery = (name: string, value?: string | null) => value ? `?${name}=${q(value)}` : ''

export const threadKeys = {
  person: (orgId: number, userId: number, goalUuid?: string | null) => base(orgId, `/people/${userId}${focusQuery('goal_uuid', goalUuid)}`),
  group: (orgId: number, groupId: number, assignmentUuid?: string | null) => base(orgId, `/groups/${groupId}${focusQuery('assignment_uuid', assignmentUuid)}`),
  staffRoom: (orgId: number) => base(orgId, '/staff'),
  org: (orgId: number) => base(orgId, '/org'),
}

export const threadsApi = {
  person: (orgId: number, userId: number, token?: string, goalUuid?: string | null) => request<PersonThread>(threadKeys.person(orgId, userId, goalUuid), token),
  group: (orgId: number, groupId: number, token?: string, assignmentUuid?: string | null) => request<GroupThread>(threadKeys.group(orgId, groupId, assignmentUuid), token),
  staffRoom: (orgId: number, token?: string) => request<StaffRoomThread>(threadKeys.staffRoom(orgId), token),
  org: (orgId: number, token?: string) => request<OrgThread>(threadKeys.org(orgId), token),
}
