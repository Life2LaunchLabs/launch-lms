import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { getAPIUrl } from '@services/config/config'
import type { GoalStatus, StepCompleter, StepResult, StepStatus, StepMaterial, StepTypeKey } from './types'
import type { AssignmentVersionStatus } from './versionStatus'

const q = encodeURIComponent

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export const goalAdminUrl = (path: string, orgId: number) => `${getAPIUrl()}goal-admin${path}${path.includes('?') ? '&' : '?'}org_id=${orgId}`

/** A person as staff views return them. */
export interface StaffPerson { id: number; username?: string; first_name?: string; last_name?: string; avatar_image?: string | null; user_uuid?: string }
export interface StaffNoteView { note_uuid?: string; user_id?: number | null; message: string; created_at: string; author?: StaffPerson | null }
type AssignmentContext = { assignment_uuid: string | null; template: { template_uuid: string; title: string } | null; group: { id: number; name: string } | null }

// Review inbox ---------------------------------------------------------------------

export type InboxKind = 'review' | 'grade' | 'confirm' | 'nudge'
export interface InboxItem { goal_uuid: string; step_uuid?: string; review_id?: string; user: StaffPerson | null; submitted_at?: string; last_active?: string; open_count?: number; template?: AssignmentContext['template']; group?: AssignmentContext['group'] }
export interface InboxGroup extends AssignmentContext {
  kind: InboxKind
  step_key: string | null
  step_uuid: string | null
  activity_uuid: string | null
  step: { title: string; stage_title: string | null; type: StepTypeKey | null }
  items: InboxItem[]
  count: number
  oldest_at: string | null
}
export interface Inbox { groups: InboxGroup[]; counts: Record<InboxKind, number>; total: number }

export interface ReviewEntry { entry_uuid: string; kind: 'file' | 'link' | 'item'; slot: string | null; title: string; url: string; filename: string | null; mime_type: string | null; asset_uuid: string | null; note: string; done: boolean; data: Record<string, unknown> }
export interface ReviewItem {
  goal_uuid: string
  step_uuid: string
  step_key: string | null
  status: StepStatus
  user: StaffPerson | null
  entries: ReviewEntry[]
  submission: Record<string, any>
  answer: string
  result: StepResult | null
  learner_note: string
  feedback_history: Array<{ message: string; action?: string; created_at?: string }>
  attempt: number
  staff_notes: StaffNoteView[]
  submitted_at: string | null
  activity_reviews?: ActivityReview[]
}
export interface RequirementLabel { node_uuid: string; framework_uuid: string; framework_name: string; code: string; title: string }
export interface ReviewQueue extends AssignmentContext {
  step: { step_key: string | null; step_uuid: string | null; title: string; description: string; type: StepTypeKey | null; stage_title: string | null; reviewer_guidance: string; requirements: RequirementLabel[]; confirm_only: boolean }
  items: ReviewItem[]
}

/** Activity answers waiting on a manual grade (the shape ActivityAggregateGradeForm reads). */
export interface ActivityReview {
  review_type: 'activity'
  review_id: string
  run_uuid: string
  goal_uuid: string
  step_uuid: string | null
  user: StaffPerson
  badge: { id: number; badge_uuid: string; name: string } | null
  activity: { activity_uuid: string; title: string; [key: string]: any }
  attempts: any[]
  attempt_history: any[]
  pending_attempt_uuids: string[]
  submitted_at: string
  [key: string]: any
}
export interface StepReview extends ReviewItem { review_type: 'step'; progress_uuid: string; step: { title: string; type: StepTypeKey; stage_title: string | null; reviewer_guidance: string } }
export interface ReviewList { step_reviews: StepReview[]; activity_reviews: ActivityReview[] }

// Assignments, cohorts and learners -------------------------------------------------

/** Active: staff run it. Paused: held, learners keep working. Ended: over, and learners keep their plans. */
export type AssignmentStatus = 'active' | 'paused' | 'ended'

export interface AssignmentSummary {
  assignment_uuid: string
  template_uuid: string
  template_title: string
  version: number | null
  usergroup_id: number | null
  user_id: number | null
  subject_email: string | null
  welcome_message: string
  staff_user_ids: number[]
  staff: StaffPerson[]
  start_date: string | null
  due_date: string | null
  status: AssignmentStatus
  paused_at: string | null
  ended_at: string | null
  creation_date: string
  cohort: { id: number; uuid: string; name: string } | null
  user: StaffPerson | null
  learner_count: number
  goal_uuid: string | null
  assignment_type: 'group' | 'external' | 'individual'
  step_count: number
  completed_count: number
  review_count: number
  progress_percent: number
  min_progress_percent: number
  max_progress_percent: number
  [key: string]: unknown
}

/** Where one learner's step stands for staff (the API's staff_views.bucket); null while there's nothing to do yet. */
export type StepBucket = 'done' | 'handed_in' | 'to_grade' | 'not_handed_in' | 'needs_settle'

export interface MatrixCell {
  step_uuid: string
  status: StepStatus
  bucket: StepBucket | null
  locked: boolean
  locked_reason: unknown
  held: boolean
  due_date: string | null
  fraction: number
  learner_note: string
  completed_at: string | null
  /** When staff last reminded the learner about this step. */
  last_reminded_at: string | null
}
export interface MatrixLearner extends StaffPerson {
  goal_uuid: string
  status: GoalStatus
  progress_percent: number
  capabilities: string[]
  custom_steps: Array<{ step_uuid: string; title: string; type: StepTypeKey; status: StepStatus }>
  cells: Record<string, MatrixCell>
  /** Everyone else on the learner's plan, with their role on it. */
  people: Array<StaffPerson & { role: string }>
}
/** One template step across the assignment: counts per bucket, and the user uuids in each. */
export interface ColumnAggregate {
  learner_count: number
  completed_count: number
  excused_count: number
  review_count: number
  done_count: number
  handed_in_count: number
  to_grade_count: number
  not_handed_in_count: number
  needs_settle_count: number
  buckets: Record<StepBucket, string[]>
}
export interface MatrixColumn {
  template_key: string
  title: string
  type: StepTypeKey
  description: string
  completed_by: StepCompleter
  review_required: boolean
  config: Record<string, any>
  materials: Array<Record<string, unknown>>
  /** How staff review it: the template's rubric for the step. */
  reviewer_guidance: string
  /** How staff run it: the template's staff guide (a lesson plan) and its files. Empty for learners. */
  staff_guide?: string
  staff_materials?: StepMaterial[]
  aggregate: ColumnAggregate
  /** When the assignment has it due: a date staff set on it (due_set), else the template's. */
  due_date: string | null
  due_set: boolean
}
/** One step across an assignment's learners, for staff on its plan: how many are where. */
export interface StepAggregate {
  /** Learners the step is on. */
  total: number
  /** Done or excused. */
  done: number
  /** Handed in and not done yet, graded or not. */
  handed_in: number
  /** Handed in and waiting on staff to grade. */
  to_grade: number
  /** Closed with nothing handed in. */
  not_handed_in: number
  /** A step staff confirm, such as an event, that is past and not settled for everyone. */
  to_settle: number
}
export interface MatrixStage { stage_key: string; title: string; position: number; start_date: string | null; due_date: string | null; steps: MatrixColumn[] }
export interface AssignmentMatrix {
  assignment: AssignmentSummary
  assignments: AssignmentSummary[]
  cohort: { id: number; uuid: string; name: string } | null
  version: number | null
  stages: MatrixStage[]
  learners: MatrixLearner[]
  /** The viewer runs assignments, so can move a step's due date. */
  can_reschedule?: boolean
}
export interface Cohort { cohort: { id: number; uuid: string; name: string; description: string; thumbnail_image: string }; learner_count: number; assignments: AssignmentSummary[]; completed_assignments: AssignmentSummary[] }
export interface ManagedGoal { goal_uuid: string; title: string; status: GoalStatus; source: string; target_date: string | null; progress: { done: number; total: number }; people?: Array<StaffPerson & { role: string }> }
export interface ManagedUser { user: StaffPerson; assignments: Array<AssignmentSummary & { goal: ManagedGoal }>; goals: ManagedGoal[] }
export type BulkResult = { user_id: number | null; goal_uuid: string; step_uuid: string; status: StepStatus | 'skipped'; reason?: string }
type StepOutcome = { user: StaffPerson | null; goal_uuid: string; step_uuid: string }
export interface RemindResult { reminded: StepOutcome[]; skipped: Array<StepOutcome & { reason: string }> }
export interface SettleResult { settled: StepOutcome[]; skipped: Array<StepOutcome & { reason: string }>; left: StepOutcome[] }

export const inboxKey = (orgId: number) => goalAdminUrl('/inbox', orgId)
export const cohortKey = (groupId: number, orgId: number) => goalAdminUrl(`/cohorts/${groupId}`, orgId)
const managedUserKey = (userId: number, orgId: number) => goalAdminUrl(`/managed-users/${userId}`, orgId)
const assignmentsKey = (orgId: number) => goalAdminUrl('/assignments', orgId)
export const matrixKey = (assignmentUuid: string, orgId: number) => goalAdminUrl(`/assignments/${q(assignmentUuid)}/matrix`, orgId)
export const assignmentReviewsKey = (assignmentUuid: string, orgId: number) => goalAdminUrl(`/assignments/${q(assignmentUuid)}/reviews`, orgId)
export const plansKey = (orgId: number) => goalAdminUrl('/plans', orgId)

// Plans › Assignments: one card per plan template (apps/api/src/services/goals/plan_cards.py) -------------

export interface OrgRef { id: number; name: string; slug: string }
/** One assignment on a plan card: the assignment summary, its learners' ids and its version status. */
export interface PlanAssignment extends AssignmentSummary, AssignmentVersionStatus {
  learner_ids: number[]
}
export interface PlanCardData {
  template: {
    template_uuid: string
    title: string
    status: string
    /** The published version. */
    version: number | null
    stage_count: number
    step_count: number
    owner_org: OrgRef | null
    /** Made by this organization. */
    own: boolean
    /** Another organization's template this one runs with its permission (a badge route). */
    run_with_permission: boolean
  }
  badges: Array<{ badge_uuid: string; name: string; thumbnail_image: string; org_id: number; owner_org: OrgRef | null }>
  frameworks: Array<{ framework_uuid: string; name: string; org_id: number; node_count: number }>
  /** This organization's assignments of the plan, ended ones too, newest first. */
  assignments: PlanAssignment[]
  /** On the org's own plans, for admins: other organizations running it now, counts only. */
  authorized_orgs: Array<{ org: OrgRef | null; assignment_count: number; learner_count: number; since: string }>
}
export interface PlansStack { plans: PlanCardData[]; learners: StaffPerson[] }

/** Staff views across goals (/goal-admin). */
export const goalAdminApi = {
  inbox: (orgId: number, token?: string) => request<Inbox>(inboxKey(orgId), token),
  queue: (orgId: number, params: { assignment: string; stepKey?: string | null; stepUuid?: string | null }, token?: string) => {
    const query = new URLSearchParams({ assignment_uuid: params.assignment })
    if (params.stepKey) query.set('step_key', params.stepKey)
    if (params.stepUuid) query.set('step_uuid', params.stepUuid)
    return request<ReviewQueue>(goalAdminUrl(`/inbox/queue?${query}`, orgId), token)
  },
  decide: (orgId: number, stepUuid: string, action: 'confirm' | 'flag', message: string, token?: string) => request<{ goal_uuid: string; step_uuid: string; status: StepStatus }>(goalAdminUrl('/inbox/decide', orgId), token, 'POST', { step_uuid: stepUuid, action, message }),
  confirm: (orgId: number, stepUuids: string[], message: string, token?: string) => request<{ confirmed: string[]; skipped: string[] }>(goalAdminUrl('/inbox/confirm', orgId), token, 'POST', { step_uuids: stepUuids, message }),
  addStaffNote: (orgId: number, stepUuid: string, message: string, token?: string) => request<{ step_uuid: string; staff_notes: StaffNoteView[] }>(goalAdminUrl('/inbox/staff-notes', orgId), token, 'POST', { step_uuid: stepUuid, message }),

  assignments: (orgId: number, token?: string) => request<AssignmentSummary[]>(assignmentsKey(orgId), token),
  /** Plans › Assignments: each plan with its assignments here (staff: only plans they staff). */
  plans: (orgId: number, token?: string) => request<PlansStack>(plansKey(orgId), token),
  matrix: (orgId: number, assignmentUuid: string, token?: string) => request<AssignmentMatrix>(matrixKey(assignmentUuid, orgId), token),
  updateProgress: (orgId: number, data: { template_key: string; assignment_uuid?: string; goal_uuids?: string[]; user_ids?: number[]; status: StepStatus; staff_note?: string }, token?: string) => request<BulkResult[]>(goalAdminUrl('/assignments/progress', orgId), token, 'POST', data),
  assignmentReviews: (orgId: number, assignmentUuid: string, token?: string) => request<ReviewList & { assignment_uuid: string }>(assignmentReviewsKey(assignmentUuid, orgId), token),

  // Running an assignment (admins): only the fields sent change.
  updateAssignment: (orgId: number, assignmentUuid: string, data: { start_date?: string | null; due_date?: string | null; welcome_message?: string; collaborators?: Array<{ user_id: number; role_key: string }> }, token?: string) =>
    request<AssignmentSummary>(goalAdminUrl(`/assignments/${q(assignmentUuid)}`, orgId), token, 'PATCH', data),
  pause: (orgId: number, assignmentUuid: string, token?: string) => request<AssignmentSummary>(goalAdminUrl(`/assignments/${q(assignmentUuid)}/pause`, orgId), token, 'POST'),
  resume: (orgId: number, assignmentUuid: string, token?: string) => request<AssignmentSummary>(goalAdminUrl(`/assignments/${q(assignmentUuid)}/resume`, orgId), token, 'POST'),
  end: (orgId: number, assignmentUuid: string, token?: string) => request<AssignmentSummary>(goalAdminUrl(`/assignments/${q(assignmentUuid)}/end`, orgId), token, 'POST'),
  /** When one step is due on the assignment, on its learners' plans too; null goes back to the template's date. */
  setStepDue: (orgId: number, assignmentUuid: string, stepKey: string, dueDate: string | null, token?: string) =>
    request<AssignmentSummary>(goalAdminUrl(`/assignments/${q(assignmentUuid)}/steps/${q(stepKey)}/due`, orgId), token, 'PUT', { due_date: dueDate }),
  /** A reminder card in each feed of the learners who haven't handed the step in (or just these), at most once a day each. */
  remind: (orgId: number, assignmentUuid: string, stepKey: string, data: { user_uuids?: string[]; message?: string } = {}, token?: string) =>
    request<RemindResult>(goalAdminUrl(`/assignments/${q(assignmentUuid)}/steps/${q(stepKey)}/remind`, orgId), token, 'POST', data),
  /** Mark a step staff confirm done for everyone on the assignment except these learners. */
  settle: (orgId: number, assignmentUuid: string, stepKey: string, data: { except_user_uuids?: string[]; message?: string } = {}, token?: string) =>
    request<SettleResult>(goalAdminUrl(`/assignments/${q(assignmentUuid)}/steps/${q(stepKey)}/settle`, orgId), token, 'POST', data),
  cohort: (orgId: number, groupId: number, token?: string) => request<Cohort>(cohortKey(groupId, orgId), token),
  managedUser: (orgId: number, userId: number, token?: string) => request<ManagedUser>(managedUserKey(userId, orgId), token),
}
