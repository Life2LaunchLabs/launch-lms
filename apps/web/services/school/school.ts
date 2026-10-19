import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { filterQuery, type Chat, type ChatFilter, type ChatMessage } from '@services/connect/connect'
import type { PersonSummary } from '@services/goals/types'

const q = encodeURIComponent
const base = (orgId: number, path: string) => `${getAPIUrl()}school/orgs/${orgId}${path}`

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type StaffRole = 'viewer' | 'commenter' | 'editor'
export interface GroupStaffMember { user: PersonSummary; role_key: StaffRole; assignment_uuids: string[]; all_goals: boolean; goal_count: number }
export interface GroupStaff {
  staff: GroupStaffMember[]
  choices: Array<{ key: StaffRole; name: string; hint: string }>
  goals: Array<{ assignment_uuid: string; title: string }>
  /** The organization's staff who aren't on this group yet. */
  candidates: PersonSummary[]
}

export interface TeamMember { user: PersonSummary; groups: Array<{ group_id: number; name: string; role_key: StaffRole; role: string }> }
export interface StaffNote { note_uuid: string; body: string; author: PersonSummary | null; creation_date: string; can_delete: boolean }
export interface StudentView { student: PersonSummary; team: TeamMember[]; notes: StaffNote[] }

export interface WaitingStudent { student: PersonSummary; unread: number; mentions: number; reviews: number; last_message: ChatMessage | null }
export interface Waiting { mine: boolean; can_see_everyone: boolean; students: WaitingStudent[] }

export type ReportStatus = 'open' | 'resolved' | 'dismissed'
export interface ReportMessage { message_uuid: string; sender: PersonSummary | null; kind: string; body: string; creation_date: string; reported: boolean }
export interface ChatReport {
  report_uuid: string; reason: string; status: ReportStatus; creation_date: string
  reporter: PersonSummary | null; reported: PersonSummary | null; reporter_in_org: boolean; reported_in_org: boolean
  chat: { kind: string; title: string | null } | null
  /** The reported message as it was, when it has since been deleted. */
  excerpt: string | null
  /** The last few messages up to the reported one. */
  messages: ReportMessage[]
  reviewed_by: PersonSummary | null; review_date: string | null
}
/** total counts every report the organization can see, in any status. */
export interface ChatReports { status: ReportStatus; open: number; total: number; reports: ChatReport[] }

export const schoolKeys = {
  groupStaff: (orgId: number, groupId: number) => base(orgId, `/groups/${groupId}/staff`),
  student: (orgId: number, userId: number) => base(orgId, `/students/${userId}`),
  /** The learner's chat with the organization; admins who aren't in it read along (can_post false). */
  studentChat: (orgId: number, userId: number, filter: ChatFilter = {}) => base(orgId, `/students/${userId}/chat${filterQuery(filter)}`),
  waiting: (orgId: number, mine: boolean) => base(orgId, `/waiting?mine=${mine}`),
  reports: (orgId: number, status: ReportStatus = 'open') => base(orgId, `/reports?status=${status}`),
}

export const schoolApi = {
  groupStaff: (orgId: number, groupId: number, token?: string) => request<GroupStaff>(schoolKeys.groupStaff(orgId, groupId), token),
  setStaff: (orgId: number, groupId: number, data: { user_id: number; role_key: StaffRole; assignment_uuids: string[] }, token?: string) =>
    request<GroupStaff>(schoolKeys.groupStaff(orgId, groupId), token, 'PUT', data),
  removeStaff: (orgId: number, groupId: number, userId: number, token?: string) => request<GroupStaff>(`${schoolKeys.groupStaff(orgId, groupId)}/${userId}`, token, 'DELETE'),
  student: (orgId: number, userId: number, token?: string) => request<StudentView>(schoolKeys.student(orgId, userId), token),
  studentChat: (orgId: number, userId: number, token?: string, filter: ChatFilter = {}) => request<Chat>(schoolKeys.studentChat(orgId, userId, filter), token),
  addNote: (orgId: number, userId: number, body: string, token?: string) => request<StaffNote[]>(`${schoolKeys.student(orgId, userId)}/notes`, token, 'POST', { body }),
  deleteNote: (orgId: number, userId: number, noteUuid: string, token?: string) => request<StaffNote[]>(`${schoolKeys.student(orgId, userId)}/notes/${q(noteUuid)}`, token, 'DELETE'),
  waiting: (orgId: number, mine: boolean, token?: string) => request<Waiting>(schoolKeys.waiting(orgId, mine), token),
  reports: (orgId: number, status: ReportStatus, token?: string) => request<ChatReports>(schoolKeys.reports(orgId, status), token),
  reviewReport: (orgId: number, reportUuid: string, status: ReportStatus, token?: string) =>
    request<ChatReport>(`${base(orgId, '/reports')}/${q(reportUuid)}`, token, 'PUT', { status }),
}
