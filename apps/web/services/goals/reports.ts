import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalAdminUrl } from './admin'

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

type Person = { id: number; user_uuid?: string; username?: string; first_name?: string; last_name?: string; avatar_image?: string | null }

export interface GroupReportPlan {
  assignment_uuid: string
  template_uuid: string
  template_title: string
  version: number | null
  status: 'active' | 'paused' | string
  due_date: string | null
  learner_count: number
  progress_percent: number
  finished_count: number
  behind_count: number
  badge: { badge_uuid: string; name: string; thumbnail_image?: string | null; earned_count: number } | null
}

export interface GroupReportLearner extends Person {
  goal_uuid: string
  assignment_uuid: string
  template_title: string
  version: number | null
  done: number
  total: number
  status: 'behind' | 'on_pace' | 'finished' | 'paused'
  behind: boolean
  handed_in: boolean
  next_steps: string[]
}

export interface GroupReportFramework {
  framework_uuid: string
  name: string
  learner_count: number
}

export interface GroupReportIncludedFramework extends GroupReportFramework {
  draft: boolean
  requirement_count: number
  met_percent: number
  not_enrolled: number
  learners: Array<Person & { met: number; total: number; gaps: number; still_needs: Array<{ node_uuid: string; code: string; title: string; state: 'planned' | 'gap' }> }>
}

/** A group's plans and badges, who's behind and what's left, and any requirement frameworks asked for. */
export interface GroupReport {
  group: { id: number; uuid: string; name: string }
  org: { id: number; name: string; slug: string }
  generated_on: string
  summary: { learner_count: number; learners_on_plans: number; steps_done: number; steps_total: number; progress_percent: number; behind_count: number; behind_names: string[]; plan_count: number; badges_earned: number }
  plans: GroupReportPlan[]
  learners: GroupReportLearner[]
  frameworks: GroupReportFramework[]
  included_frameworks: GroupReportIncludedFramework[]
}

/** The card a sent report becomes in a chat. It links to the live report. */
export interface GroupReportCard {
  type: 'group_report'
  org_id: number
  org_slug: string
  usergroup_id: number
  group_name: string
  frameworks: string[]
  framework_names: string[]
  message: string
  summary: { learner_count: number; progress_percent: number; behind_count: number; plan_count: number; badges_earned: number }
  sent_on: string
}

export type OrgMembership = { user?: Person & { email?: string }; role?: { id: number; name?: string; rights?: Record<string, Record<string, boolean>> } }

export const groupReportKey = (orgId: number, groupId: number, frameworks: string[] = []) =>
  goalAdminUrl(`/groups/${groupId}/report${frameworks.length ? `?frameworks=${encodeURIComponent(frameworks.join(','))}` : ''}`, orgId)

export const reportsApi = {
  get: (orgId: number, groupId: number, frameworks: string[] = [], token?: string) => request<GroupReport>(groupReportKey(orgId, groupId, frameworks), token),
  send: (orgId: number, groupId: number, data: { recipient_user_ids: number[]; message: string; frameworks: string[] }, token?: string) =>
    request<{ sent: Array<{ user_id: number; message_uuid: string }>; skipped: Array<{ user_id: number; reason: string }> }>(goalAdminUrl(`/groups/${groupId}/report/send`, orgId), token, 'POST', data),
  /** The organization's members, to choose who gets a report. */
  members: (orgId: number, token?: string) => request<{ items?: OrgMembership[] }>(`${getAPIUrl()}orgs/${orgId}/users?page=1&limit=100`, token),
}
