import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { Chat, ChatSummary } from '@services/connect/connect'
import type { PersonSummary } from '@services/goals/types'

const q = encodeURIComponent
const base = (orgId: number, path: string) => `${getAPIUrl()}school/orgs/${orgId}${path}`

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** What someone is to the organization. Helpers aren't members: a learner brought them onto one plan. */
export type OrgRole = 'admin' | 'staff' | 'learner' | 'helper'

export interface HelpingOn { goal_uuid: string; title: string; collaborator_uuid: string; learner: PersonSummary | null }

export interface DirectoryPerson {
  user: PersonSummary
  role: OrgRole
  /** The organization role's own name, such as "Counselor". */
  role_name: string
  groups: Array<{ id: number; name: string }>
  helping_on?: HelpingOn[]
}
export interface Directory { people: DirectoryPerson[]; total: number; offset: number; limit: number }

/** A chat in People: a group's chat, or a direct chat with one of the organization's people. */
export interface PeopleChat extends ChatSummary {
  group_id: number | null
  member_count: number
  /** The other person's role, for a direct chat. */
  role: OrgRole | null
}
export interface PeopleChats { chats: PeopleChat[]; groups_enabled: boolean }

export interface ProfilePlan {
  goal_uuid: string
  title: string
  status: string
  source: string
  progress: { done: number; total: number; submitted: number; behind: number }
  assignment_uuid: string | null
  assignment_status: string | null
}

export interface Profile {
  user: PersonSummary & { email?: string; last_login_at?: string | null }
  role: OrgRole
  role_name: string
  org_role: { id: number; role_uuid: string; name: string } | null
  joined_at: string | null
  groups: Array<{ id: number; name: string; as: 'member' | 'staff' }>
  plans: ProfilePlan[]
  helpers: Array<{ user: PersonSummary | null; collaborator_uuid: string; role: string; goal_uuid: string; goal_title: string }>
  helping_on: HelpingOn[]
  can_message: boolean
  /** Why you can't message them directly, when you can't. */
  note: string | null
  /** Your direct chat with them, when there is one. */
  chat_uuid: string | null
  manage: { change_role: boolean; remove: boolean; groups: boolean; remove_helper: boolean }
}

export interface MessagingPolicy {
  /** Staff and learners may chat one to one. Off keeps those conversations in plan feeds. */
  staff_dm_learners: boolean
  /** A learner's plan feed takes messages once at least two staff are on it. */
  min_two_staff_on_feeds: boolean
  /** A helper a learner asks for on an organization's plan joins only after an admin approves. */
  helper_approval: boolean
}

export interface HelperRequest {
  invitation_uuid: string
  status: string
  creation_date: string
  helper: PersonSummary | null
  email: string
  role: { key: string; name: string } | null
  goal: { goal_uuid: string; title: string }
  learner: PersonSummary | null
  invited_by: PersonSummary | null
}
export interface HelperRequests { requests: HelperRequest[]; total: number }

const helperBase = (path = '') => `${getAPIUrl()}goal-admin/helper-requests${path}`

export const peopleKeys = {
  directory: (orgId: number, query = '', offset = 0) => base(orgId, `/people?q=${q(query)}&offset=${offset}`),
  profile: (orgId: number, username: string) => base(orgId, `/people/${q(username)}`),
  chats: (orgId: number) => base(orgId, '/chats'),
  messaging: (orgId: number) => base(orgId, '/messaging'),
  helperRequests: (orgId: number) => helperBase(`?org_id=${orgId}`),
}

export const peopleApi = {
  directory: (orgId: number, query: string, token?: string, offset = 0) => request<Directory>(peopleKeys.directory(orgId, query, offset), token),
  profile: (orgId: number, username: string, token?: string) => request<Profile>(peopleKeys.profile(orgId, username), token),
  chats: (orgId: number, token?: string) => request<PeopleChats>(peopleKeys.chats(orgId), token),
  /** A group's chat, for its members and staff. */
  groupChat: (orgId: number, groupId: number, token?: string) => request<Chat>(base(orgId, `/groups/${groupId}/chat`), token, 'POST'),
  messaging: (orgId: number, token?: string) => request<MessagingPolicy>(peopleKeys.messaging(orgId), token),
  setMessaging: (orgId: number, policy: MessagingPolicy, token?: string) => request<MessagingPolicy>(peopleKeys.messaging(orgId), token, 'PUT', policy),
  helperRequests: (orgId: number, token?: string) => request<HelperRequests>(peopleKeys.helperRequests(orgId), token),
  decideHelper: (orgId: number, invitationUuid: string, approve: boolean, token?: string) =>
    request<HelperRequest>(helperBase(`/${q(invitationUuid)}/${approve ? 'approve' : 'decline'}?org_id=${orgId}`), token, 'POST'),
}

export const ROLE_LABELS: Record<OrgRole, string> = { admin: 'Admin', staff: 'Staff', learner: 'Learner', helper: 'Helper' }
