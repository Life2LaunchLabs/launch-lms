import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { getAPIUrl } from '@services/config/config'
import { goalUrl } from './goals'
import type { GoalStatus, StepCompleter, StepResult, StepStatus, StepTypeKey } from './types'

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

export interface AssignmentSummary {
  assignment_uuid: string
  template_uuid: string
  template_title: string
  version: number | null
  usergroup_id: number | null
  user_id: number | null
  staff: StaffPerson[]
  start_date: string | null
  due_date: string | null
  active: boolean
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
export interface MatrixCell { step_uuid: string; status: StepStatus; locked: boolean; locked_reason: unknown; held: boolean; due_date: string | null; fraction: number; learner_note: string; completed_at: string | null }
export interface MatrixLearner extends StaffPerson { goal_uuid: string; status: GoalStatus; progress_percent: number; capabilities: string[]; custom_steps: Array<{ step_uuid: string; title: string; type: StepTypeKey; status: StepStatus }>; cells: Record<string, MatrixCell> }
export interface MatrixColumn { template_key: string; title: string; type: StepTypeKey; description: string; completed_by: StepCompleter; review_required: boolean; aggregate: { learner_count: number; completed_count: number; excused_count: number; review_count: number } }
export interface AssignmentMatrix {
  assignment: AssignmentSummary
  assignments: AssignmentSummary[]
  cohort: { id: number; uuid: string; name: string } | null
  stages: Array<{ stage_key: string; title: string; position: number; start_date: string | null; due_date: string | null; steps: MatrixColumn[] }>
  learners: MatrixLearner[]
}
export interface Cohort { cohort: { id: number; uuid: string; name: string; description: string; thumbnail_image: string }; learner_count: number; assignments: AssignmentSummary[]; completed_assignments: AssignmentSummary[] }
export interface ManagedGoal { goal_uuid: string; title: string; status: GoalStatus; source: string; target_date: string | null; progress: { done: number; total: number } }
export interface ManagedUser { user: StaffPerson; assignments: Array<AssignmentSummary & { goal: ManagedGoal }>; goals: ManagedGoal[] }
export type BulkResult = { user_id: number | null; goal_uuid: string; step_uuid: string; status: StepStatus | 'skipped'; reason?: string }

// Goal log --------------------------------------------------------------------------

export interface GoalActivityItem { activity_uuid: string; action: string; payload: Record<string, any>; actor: { name?: string; username?: string; avatar_image?: string | null; user_uuid?: string } | null; creation_date: string }
export interface GoalAttachment { asset_uuid: string; title: string; url: string; filename: string; mime_type: string; creation_date: string }

export const inboxKey = (orgId: number) => goalAdminUrl('/inbox', orgId)
export const goalReviewsKey = (goalUuid: string, orgId: number) => goalAdminUrl(`/goals/${q(goalUuid)}/reviews`, orgId)
export const cohortKey = (groupId: number, orgId: number) => goalAdminUrl(`/cohorts/${groupId}`, orgId)
export const managedUserKey = (userId: number, orgId: number) => goalAdminUrl(`/managed-users/${userId}`, orgId)
export const matrixKey = (assignmentUuid: string, orgId: number) => goalAdminUrl(`/assignments/${q(assignmentUuid)}/matrix`, orgId)
export const assignmentReviewsKey = (assignmentUuid: string, orgId: number) => goalAdminUrl(`/assignments/${q(assignmentUuid)}/reviews`, orgId)

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

  assignments: (orgId: number, token?: string) => request<AssignmentSummary[]>(goalAdminUrl('/assignments', orgId), token),
  matrix: (orgId: number, assignmentUuid: string, token?: string) => request<AssignmentMatrix>(matrixKey(assignmentUuid, orgId), token),
  updateProgress: (orgId: number, data: { template_key: string; assignment_uuid?: string; goal_uuids?: string[]; user_ids?: number[]; status: StepStatus; staff_note?: string }, token?: string) => request<BulkResult[]>(goalAdminUrl('/assignments/progress', orgId), token, 'POST', data),
  assignmentReviews: (orgId: number, assignmentUuid: string, token?: string) => request<ReviewList & { assignment_uuid: string }>(assignmentReviewsKey(assignmentUuid, orgId), token),
  goalReviews: (orgId: number, goalUuid: string, token?: string) => request<ReviewList & { goal_uuid: string }>(goalReviewsKey(goalUuid, orgId), token),
  cohort: (orgId: number, groupId: number, token?: string) => request<Cohort>(cohortKey(groupId, orgId), token),
  managedUser: (orgId: number, userId: number, token?: string) => request<ManagedUser>(managedUserKey(userId, orgId), token),
}

export const goalActivityKey = (goalUuid: string) => goalUrl(goalUuid, '/activity')
export const goalAttachmentsKey = (goalUuid: string) => goalUrl(goalUuid, '/attachments')

/** A goal's activity log, comments and files, plus archiving (goal_sharing router). */
export const goalLogApi = {
  activity: (goalUuid: string, token?: string) => request<GoalActivityItem[]>(goalActivityKey(goalUuid), token),
  comment: (goalUuid: string, body: string, token?: string) => request<GoalActivityItem>(goalUrl(goalUuid, '/comments'), token, 'POST', { body }),
  attachments: (goalUuid: string, token?: string) => request<GoalAttachment[]>(goalAttachmentsKey(goalUuid), token),
  removeAttachment: (goalUuid: string, assetUuid: string, token?: string) => request(goalUrl(goalUuid, `/attachments/${q(assetUuid)}`), token, 'DELETE'),
  archive: (goalUuid: string, token?: string) => request(goalUrl(goalUuid, '/archive'), token, 'POST'),
}
