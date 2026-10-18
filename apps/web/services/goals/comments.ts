import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalUrl } from './goals'
import type { PersonSummary } from './types'

const q = encodeURIComponent

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export interface GoalComment {
  comment_uuid: string
  /** The step the thread is on, or null for the goal as a whole. */
  step_uuid: string | null
  body: string
  author: PersonSummary | null
  mentions: PersonSummary[]
  creation_date: string
  update_date: string
  can_edit: boolean
  can_delete: boolean
}

export interface GoalCommentThread extends GoalComment {
  resolved: boolean
  resolved_at: string | null
  resolved_by: PersonSummary | null
  replies: GoalComment[]
}

export interface GoalComments {
  goal_uuid: string
  can_comment: boolean
  threads: GoalCommentThread[]
}

/** What happened to each @mention: told, invited as a Commenter, or asked for from the goal's admins. */
export type MentionOutcome = { user: PersonSummary; status: 'notified' | 'invited' | 'requested' | 'no_access' }

export type MentionCandidate = PersonSummary & { has_access: boolean }

export const goalCommentsKey = (goalUuid: string) => goalUrl(goalUuid, '/comments')

export const goalCommentsApi = {
  list: (goalUuid: string, token?: string) => request<GoalComments>(goalCommentsKey(goalUuid), token),
  add: (goalUuid: string, data: { body: string; step_uuid?: string | null; parent_uuid?: string | null }, token?: string) =>
    request<{ thread: GoalCommentThread; mentions: MentionOutcome[] }>(goalCommentsKey(goalUuid), token, 'POST', data),
  update: (goalUuid: string, commentUuid: string, body: string, token?: string) => request<GoalComment>(goalUrl(goalUuid, `/comments/${q(commentUuid)}`), token, 'PATCH', { body }),
  remove: (goalUuid: string, commentUuid: string, token?: string) => request(goalUrl(goalUuid, `/comments/${q(commentUuid)}`), token, 'DELETE'),
  resolve: (goalUuid: string, commentUuid: string, resolved: boolean, token?: string) => request<GoalCommentThread>(goalUrl(goalUuid, `/comments/${q(commentUuid)}/resolve`), token, 'POST', { resolved }),
  mentionCandidates: (goalUuid: string, query: string, token?: string) => request<MentionCandidate[]>(goalUrl(goalUuid, `/mention-candidates?q=${q(query)}`), token),
}
