import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { AssignmentListItem, AssignmentPerson, AssignmentRole, AssignmentTarget } from '@services/assignments/assignments'
import type { CardOutcome, DashboardCard, Scope } from '@services/insights/insights'
import type { StaffPermission } from '@services/organizations/membership'
import type { FeedRow, PinnedRow } from '@services/school/people'
import { goalAdminUrl } from './admin'
import type { GoalIcon, StepCompleter, StepTypeKey } from './types'

async function request<T>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** Home's sections, in page order; the API says which ones a viewer gets. */
export type HomeSectionId = 'needs' | 'assignments' | 'continue' | 'week' | 'glance' | 'requirements'
export type HomeDismissable = 'welcome' | 'first_steps' | 'needs_intro'
export type StaffStepKey = 'profile' | 'brief' | 'try' | 'hello' | 'review' | 'plans' | 'preview' | 'people' | 'insights'
export type TickableStep = 'brief' | 'try' | 'plans' | 'preview' | 'people'

/** An assignment as a This week row names it. */
export interface HomeAssignment {
  assignment_uuid: string
  template_uuid: string
  template_title: string
  assigned_to: string
  assignment_type: 'group' | 'individual' | 'external'
  goal_uuid: string | null
  learner_count: number
}

export type StepBucket = 'done' | 'handed_in' | 'to_grade' | 'not_handed_in' | 'needs_settle'
export type HomeTodayItem = HomeAssignment & { date: string; stage_key: string; stage_title: string | null; title: string | null } & (
  | { kind: 'stage_opens'; step_count: number }
  | { kind: 'step_closes'; step_key: string; type: StepTypeKey | null; completed_by: StepCompleter; counts: Record<StepBucket | 'learners', number> }
)
export interface HomeWeek { days: number; items: HomeTodayItem[]; total: number }

/** How learners are doing on each requirement framework (the most tracked first); the card links to Insights. */
export interface HomeRequirements {
  frameworks: Array<{ framework_uuid: string; name: string; learners: number; progress: number | null; completed: number }>
  total: number
}

export type GettingStartedStepKey = 'plan' | 'organization' | 'staff' | 'groups' | 'requirements' | 'learners' | 'assign'
/** The org setup checklist, for admins. `note` says what a done step has: "3 plans". */
export interface AdminFirstSteps {
  kind: 'admin'
  steps: { key: GettingStartedStepKey; done: boolean; optional: boolean; note?: string | null }[]
  done: number
  total: number
  /** The org was set up at /start, so some steps came done. */
  from_setup?: boolean
  /** Every required step is done; it stays until dismissed. */
  complete?: boolean
}
/** A staff member's lap of the places they'll work; `focus` is the first assignment they're on, which the steps name. */
export interface StaffFirstSteps {
  kind: 'staff'
  steps: { key: StaffStepKey; done: boolean; optional: boolean }[]
  done: number
  total: number
  focus: { assignment_uuid: string; target: AssignmentTarget; plan: string; template_uuid: string; stage: string | null; count: number } | null
}
export type FirstSteps = AdminFirstSteps | StaffFirstSteps

/** A Threads row with something waiting on the viewer, or the staff or organization thread with something unread. */
export type NeedsRow = Omit<FeedRow, 'kind' | 'total' | 'counts'> & { kind: FeedRow['kind'] | PinnedRow['kind']; title?: string; total: number; counts: { messages: number; turn_ins: number; approvals: number } }

export type HomeAssignmentRow = AssignmentListItem & { my_role: AssignmentRole | null }

export interface ContinueItem {
  kind: 'plan' | 'framework' | 'channel'
  uuid: string
  title: string
  state: 'draft' | 'live'
  update_date: string
  icon?: GoalIcon | null
  color?: string | null
  thumbnail_image?: string | null
  /** A plan someone is on right now. */
  running?: boolean
}

export interface HomePin { dashboard_uuid: string; card_key: string; scope_key: string | null }
export interface GlanceCard {
  key: string
  source: 'pin' | 'starter'
  dashboard_uuid: string | null
  dashboard_title: string
  scope: { kind: Scope; key: string | null; name: string }
  card: DashboardCard
  result: CardOutcome
}

export interface AdminHome {
  viewer: { admin: boolean; permissions: StaffPermission[]; staff: boolean }
  /** The sections this viewer gets, in page order, and the ones they hid. */
  sections: HomeSectionId[]
  hidden: HomeSectionId[]
  /** A new member's first two weeks: the note from their invitation, when it had one. */
  welcome: { invitation: { note: string; from: AssignmentPerson | null; at: string | null } | null } | null
  first_steps: FirstSteps | null
  needs?: { rows: NeedsRow[]; total: number; intro: boolean }
  assignments?: { mine: HomeAssignmentRow[]; all: HomeAssignmentRow[] | null }
  continue?: ContinueItem[]
  week?: HomeWeek
  glance?: { cards: GlanceCard[]; starter: boolean }
  requirements?: HomeRequirements
}

/** What the Plans tabs show: the org's plans and active assignments, and its requirement frameworks. */
export interface PlansSummary { plans: number; assignments: number; frameworks: number }

export const adminHomeKey = (orgId: number) => goalAdminUrl('/home', orgId)
export const plansSummaryKey = (orgId: number) => goalAdminUrl('/plans-summary', orgId)

export const homePinsKey = (orgId: number) => goalAdminUrl('/home/pins', orgId)

export const adminHomeApi = {
  get: (orgId: number, token?: string) => request<AdminHome>(adminHomeKey(orgId), token),
  saveLayout: (orgId: number, hidden: HomeSectionId[], token?: string) => request<{ hidden: HomeSectionId[] }>(goalAdminUrl('/home/layout', orgId), token, 'PUT', { hidden }),
  dismiss: (orgId: number, what: HomeDismissable, token?: string) => request<{ dismissed: HomeDismissable[] }>(goalAdminUrl(`/home/dismiss/${what}`, orgId), token, 'POST'),
  tick: (orgId: number, step: TickableStep, token?: string) => request<{ ticks: TickableStep[] }>(goalAdminUrl(`/home/ticks/${step}`, orgId), token, 'POST'),
  pins: (orgId: number, token?: string) => request<{ pins: HomePin[] }>(homePinsKey(orgId), token),
  savePins: (orgId: number, pins: HomePin[], token?: string) => request<{ pins: HomePin[] }>(homePinsKey(orgId), token, 'PUT', { pins }),
  plansSummary: (orgId: number, token?: string) => request<PlansSummary>(plansSummaryKey(orgId), token),
}

/** A staff member's own name for learners in this org: what learners see on their messages and reviews. */
export interface LearnerName { staff: boolean; learner_name: string | null }
export const learnerNameKey = (orgId: number) => goalAdminUrl('/me/learner-name', orgId)
export const learnerNameApi = {
  get: (orgId: number, token?: string) => request<LearnerName>(learnerNameKey(orgId), token),
  save: (orgId: number, learnerName: string, token?: string) => request<LearnerName>(learnerNameKey(orgId), token, 'PUT', { learner_name: learnerName }),
}
