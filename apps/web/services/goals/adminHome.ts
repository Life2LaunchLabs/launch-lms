import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { ChatSummary } from '@services/connect/connect'
import { goalAdminUrl, type Inbox, type InboxGroup } from './admin'
import type { StepCompleter, StepTypeKey } from './types'

async function request<T>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** The Home widgets the API builds, in their default order. */
export type HomeWidgetId = 'waiting' | 'today' | 'messages' | 'attention' | 'creator'
export interface HomeLayout { order: HomeWidgetId[]; hidden: HomeWidgetId[] }

/** An assignment as a Home row names it. */
export interface HomeAssignment {
  assignment_uuid: string
  template_uuid: string
  template_title: string
  assigned_to: string
  assignment_type: 'group' | 'individual' | 'external'
  goal_uuid: string | null
  learner_count: number
}

export type HomeWaiting = Pick<Inbox, 'counts' | 'total'> & { groups: Omit<InboxGroup, 'items'>[]; reports: number | null }

export type StepBucket = 'done' | 'handed_in' | 'to_grade' | 'not_handed_in' | 'needs_settle'
export type HomeTodayItem = HomeAssignment & { date: string; stage_key: string; stage_title: string | null; title: string | null } & (
  | { kind: 'stage_opens'; step_count: number }
  | { kind: 'step_closes'; step_key: string; type: StepTypeKey | null; completed_by: StepCompleter; counts: Record<StepBucket | 'learners', number> }
)

export type HomeAttentionRow = HomeAssignment & { behind_count: number; overdue_count: number; needs_you_count: number; progress_percent: number }

type GoalCounts = { count: number; starts: number; recent_starts: number; completions: number; active: number }
export interface HomeCreator {
  recent_days: number
  templates: GoalCounts & { orgs_using: number }
  badges: GoalCounts & { awards: number; recent_awards: number }
  recent_edits: Array<{ kind: 'template' | 'badge'; uuid: string; title: string; status: string; update_date: string }>
}

export interface AdminHome {
  /** The widgets this viewer gets, by role and what the org does. */
  widgets: HomeWidgetId[]
  layout: HomeLayout
  /** Widgets the org's access doesn't include; they show with a request. */
  locked: HomeWidgetId[]
  waiting?: HomeWaiting
  today?: { days: number; items: HomeTodayItem[]; total: number }
  messages?: { chats: ChatSummary[]; unread: number }
  attention?: { assignments: HomeAttentionRow[]; total: number }
  creator?: HomeCreator
}

/** The Plans area's tabs (Assignments, Templates, Badges, Requirements, Marketplace). */
export type PlansTabId = 'assignments' | 'templates' | 'badges' | 'requirements' | 'marketplace'

/** A member's own order for the Plans tabs, and the org's default (Badges first for a badge-making org that runs nothing itself). */
export interface PlansTabsPreference {
  order: PlansTabId[]
  default: PlansTabId[]
  /** Whether the member saved their own order; Reset is offered when they did. */
  saved: boolean
}

export const adminHomeKey = (orgId: number) => goalAdminUrl('/home', orgId)
export const plansTabsKey = (orgId: number) => goalAdminUrl('/preferences/plans-tabs', orgId)

export const adminHomeApi = {
  get: (orgId: number, token?: string) => request<AdminHome>(adminHomeKey(orgId), token),
  saveLayout: (orgId: number, layout: HomeLayout, token?: string) => request<HomeLayout>(goalAdminUrl('/home/layout', orgId), token, 'PUT', layout),
  plansTabs: (orgId: number, token?: string) => request<PlansTabsPreference>(plansTabsKey(orgId), token),
  /** Saves the member's tab order; an empty order goes back to the default. */
  savePlansTabs: (orgId: number, order: PlansTabId[], token?: string) => request<PlansTabsPreference>(plansTabsKey(orgId), token, 'PUT', { order }),
}
