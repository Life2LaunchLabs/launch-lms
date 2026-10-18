import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PersonSummary } from '@services/goals/types'

const q = encodeURIComponent
export const connectUrl = (path = '') => `${getAPIUrl()}connect${path}`

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** A card the app posted for someone, such as "3 comments on Earn a nursing degree". */
export interface GoalCommentsCard {
  type: 'goal_comments'
  goal_uuid: string
  goal_title: string
  count: number
  mentioned: boolean
  comment_uuid: string
  step_uuid: string | null
  excerpt: string
}

/** Portfolio news: someone was added to it, or comments landed on it. */
export interface PortfolioCard {
  type: 'portfolio_shared' | 'portfolio_comments'
  username: string
  role?: string
  item_title?: string
  count?: number
  comment_uuid?: string
  excerpt?: string
}

export interface ChatMessage {
  message_uuid: string
  kind: 'text' | 'card'
  body: string
  card: GoalCommentsCard | PortfolioCard | null
  sender: PersonSummary | null
  mine: boolean
  creation_date: string
  update_date: string
}

export interface ChatSummary {
  conversation_uuid: string
  /** school: a student and the staff of their groups, named after the organization. */
  kind: 'direct' | 'group' | 'school'
  title: string
  people: PersonSummary[]
  /** Yours: active, or request while someone you don't know waits for your answer. */
  status: 'active' | 'request' | 'declined' | 'blocked'
  /** Both people have said yes, so links work. */
  accepted: boolean
  waiting_for_them: boolean
  unavailable: boolean
  unread: number
  last_message: ChatMessage | null
  last_message_at: string | null
}

export interface Chat extends ChatSummary {
  messages: ChatMessage[]
  has_more: boolean
}

export interface ChatCounts { unread: number; requests: number }
export interface ChatList extends ChatCounts { chats: ChatSummary[] }
export type FoundPerson = PersonSummary & { known: boolean }

export const connectKeys = {
  chats: () => connectUrl('/chats'),
  counts: () => connectUrl('/counts'),
  chat: (uuid: string) => connectUrl(`/chats/${q(uuid)}`),
  settings: () => connectUrl('/settings'),
  blocked: () => connectUrl('/blocked'),
}

export const connectApi = {
  chats: (token?: string) => request<ChatList>(connectKeys.chats(), token),
  counts: (token?: string) => request<ChatCounts>(connectKeys.counts(), token),
  chat: (uuid: string, token?: string) => request<Chat>(connectKeys.chat(uuid), token),
  openDirect: (target: { handle?: string; user_uuid?: string }, token?: string) => request<Chat>(connectUrl('/chats/direct'), token, 'POST', target),
  send: (uuid: string, body: string, token?: string) => request<ChatMessage>(connectUrl(`/chats/${q(uuid)}/messages`), token, 'POST', { body }),
  read: (uuid: string, token?: string) => request<ChatCounts>(connectUrl(`/chats/${q(uuid)}/read`), token, 'POST'),
  accept: (uuid: string, token?: string) => request<Chat>(connectUrl(`/chats/${q(uuid)}/accept`), token, 'POST'),
  decline: (uuid: string, token?: string) => request<ChatCounts>(connectUrl(`/chats/${q(uuid)}/decline`), token, 'POST'),
  block: (uuid: string, token?: string) => request<ChatCounts>(connectUrl(`/chats/${q(uuid)}/block`), token, 'POST'),
  report: (uuid: string, data: { reason: string; message_uuid?: string; block?: boolean }, token?: string) => request<{ reported: boolean; blocked: boolean }>(connectUrl(`/chats/${q(uuid)}/report`), token, 'POST', data),
  blocked: (token?: string) => request<PersonSummary[]>(connectKeys.blocked(), token),
  unblock: (userUuid: string, token?: string) => request(connectUrl(`/blocked/${q(userUuid)}`), token, 'DELETE'),
  search: (query: string, token?: string) => request<FoundPerson[]>(connectUrl(`/search?q=${q(query)}`), token),
  settings: (token?: string) => request<{ discoverable: boolean }>(connectKeys.settings(), token),
  updateSettings: (discoverable: boolean, token?: string) => request<{ discoverable: boolean }>(connectKeys.settings(), token, 'PUT', { discoverable }),
}
