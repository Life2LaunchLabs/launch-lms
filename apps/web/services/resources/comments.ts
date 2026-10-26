import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { ResourceComment, ResourceType } from './resources'

// Comments on resources and their moderation (apps/api/src/services/resource_comments.py).

const q = encodeURIComponent
const url = (path: string) => `${getAPIUrl()}resources${path}`

async function request<T = any>(target: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(target, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type CommentRule = 'all' | 'staff' | 'off'
export type ModerationAction = 'approve' | 'show' | 'hide' | 'keep'

export type ResourceCommentItem = ResourceComment & {
  /** Reports waiting on the owning org's staff (only they get a count). */
  report_count: number
  author_org: { name: string; slug: string; org_uuid: string } | null
  author_is_staff: boolean
  /** The resource it's on, in a channel's comment list. */
  resource?: { resource_uuid: string; title: string; resource_type: ResourceType }
}

export type ChannelComments = { needs_look: ResourceCommentItem[]; recent: ResourceCommentItem[] }

/** Held, or live and reported: a moderator should look before anything else. */
export const needsLook = (comment: ResourceCommentItem) => comment.status === 'held' || (comment.status === 'live' && comment.report_count > 0)

/** The same check the API makes before holding a comment with a link (LINK_PATTERN). */
export const hasLink = (text: string) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io|biz|info|co|app|ly)\b/i.test(text)

export const commentKeys = {
  resource: (uuid: string) => url(`/${q(uuid)}/comments`),
  channel: (uuid: string) => url(`/channels/${q(uuid)}/comments`),
}

export const commentsApi = {
  list: (resourceUuid: string, token?: string) => request<ResourceCommentItem[]>(commentKeys.resource(resourceUuid), token),
  channel: (channelUuid: string, token?: string) => request<ChannelComments>(commentKeys.channel(channelUuid), token),
  create: (resourceUuid: string, data: { content: string; rating?: number | null }, token?: string) =>
    request<ResourceCommentItem>(commentKeys.resource(resourceUuid), token, 'POST', data),
  remove: (commentUuid: string, token?: string) => request(url(`/comments/${q(commentUuid)}`), token, 'DELETE'),
  moderate: (commentUuid: string, action: ModerationAction, token?: string) => request<ResourceCommentItem>(url(`/comments/${q(commentUuid)}/moderate`), token, 'POST', { action }),
  report: (commentUuid: string, token?: string) => request(url(`/comments/${q(commentUuid)}/report`), token, 'POST'),
}

export const COMMENT_RULE_LABELS: Record<CommentRule, string> = { all: 'Anyone who can see it', staff: 'Staff only', off: 'Off' }
