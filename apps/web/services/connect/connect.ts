import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PersonSummary } from '@services/goals/types'

const q = encodeURIComponent
export const connectUrl = (path = '') => `${getAPIUrl()}connect${path}`
export const filterQuery = (filter: ChatFilter) => {
  const params = new URLSearchParams()
  if (filter.goal_uuid) params.set('goal_uuid', filter.goal_uuid)
  if (filter.goal_uuid && filter.step_uuid) params.set('step_uuid', filter.step_uuid)
  return params.size ? `?${params.toString()}` : ''
}

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

/** The app's record of work on a plan: it started, or steps were finished, turned in or reviewed. */
export interface ProgressCard {
  type: 'plan_progress'
  goal_uuid: string
  goal_title: string
  started: boolean
  events: { step_uuid: string; title: string; event: 'finished' | 'turned_in' | 'approved' | 'changes' | 'marked_done' | 'excused'; at: string }[]
}

/** A learner tagged this organization in another chat. */
export interface OrgMentionCard {
  type: 'org_mention'
  from_chat: string
  excerpt: string
}

/** An invitation from an organization or a person, answered right in the chat. */
export interface InvitationCard {
  type: 'invitation'
  /** goal: a plan an organization assigned you. inbox: joining an organization, or helping on a plan. */
  source: 'goal' | 'inbox'
  inbox_uuid?: string
  action_kind?: string
  goal_uuid?: string | null
  subject: string
  text: string
  state: 'pending' | 'accepted' | 'declined' | 'expired' | string
  /** Whether it's yours to answer; others in the chat see who it's for. */
  for_me: boolean
  for_name?: string | null
}

/** A notice an organization sent, such as a welcome. */
export interface NoticeCard { type: 'notice'; subject: string; text: string }

/** Plan tags say whether they're the chat's quiet scope, a plan from outside the chat, or one you can't see. */
type PlanRefFlags = { scope?: boolean; outside?: boolean; hidden?: boolean }

/** A plan, step, person or organization a message tags inline, as the reader sees it now. */
export type MessageRef =
  | ({ kind: 'plan'; key: string; goal_uuid: string; title: string } & PlanRefFlags)
  | ({ kind: 'step'; key: string; goal_uuid: string; step_uuid: string; title: string; plan_title: string; status: string } & PlanRefFlags)
  | ({ kind: 'user'; key: string } & PersonSummary)
  | { kind: 'org'; key: string; id: number; org_uuid: string; name: string; slug: string; logo_image?: string | null }

export interface ChatMessage {
  message_uuid: string
  kind: 'text' | 'card'
  /** Text with tags as tokens: <plan:goal>, <step:goal/step>, <user:uuid>, <org:uuid>. */
  body: string
  /** The text with tags written out as names. */
  preview: string
  refs: MessageRef[]
  card: GoalCommentsCard | PortfolioCard | ProgressCard | OrgMentionCard | InvitationCard | NoticeCard | null
  sender: PersonSummary | null
  mine: boolean
  creation_date: string
  update_date: string
}

export interface ChatSummary {
  conversation_uuid: string
  /** school: a learner and an organization's people on their plans, named after it. goal: a personal plan's people. */
  kind: 'direct' | 'group' | 'school' | 'goal'
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
  /** The organization an organization chat is with. */
  org?: { id: number; org_uuid: string; name: string; slug: string; logo_image?: string | null } | null
}

export interface TopicStep {
  step_uuid: string
  title: string
  status: string
  due_date: string | null
  behind: boolean
  /** Messages that tag this step. */
  count: number
}

/** A plan a chat is about: where it stands, its steps, and how much talk there is about each. */
export interface ChatTopic {
  goal_uuid: string
  title: string
  status: string
  source: string
  count: number
  progress: { done: number; total: number; submitted: number; behind: number }
  steps: TopicStep[]
  /** For your plans from elsewhere: the organization it's with. */
  org_name?: string | null
}

export interface Chat extends ChatSummary {
  messages: ChatMessage[]
  has_more: boolean
  /** Whether you write here; people who can only view a plan read along. */
  can_post: boolean
  topics: ChatTopic[]
}

/** What a chat shows: everything, one plan, or one of its steps. */
export interface ChatFilter { goal_uuid?: string; step_uuid?: string }

/** Where a plan talks, for its chat button. */
export interface GoalChat {
  goal_uuid: string
  conversation_uuid: string | null
  title: string | null
  can_post: boolean
  /** Messages per step. */
  counts: Record<string, number>
  count: number
}

export type MentionOutcome = { user: PersonSummary; status: 'notified' | 'invited' | 'requested' | 'no_access' | 'not_here' }
export type SentMessage = ChatMessage & { mentions: MentionOutcome[]; shared?: Record<string, 'shared' | 'requested' | 'none'> }

/** A plan you tagged from elsewhere that people here can't see yet. */
export interface BlindPlan { goal_uuid: string; title: string; how: 'share' | 'request' | 'none'; people: PersonSummary[] }

export interface SendOptions {
  /** The plan, or step, the chat is filtered to: the message is about it. */
  scope?: ChatFilter
  /** Who to share each of your tagged plans with. {} sends without sharing. */
  share?: Record<string, string[]>
}

export interface ChatCounts { unread: number; requests: number }
export interface ChatList extends ChatCounts { chats: ChatSummary[] }
export type FoundPerson = PersonSummary & { known: boolean }

export const connectKeys = {
  chats: () => connectUrl('/chats'),
  counts: () => connectUrl('/counts'),
  chat: (uuid: string, filter: ChatFilter = {}) => connectUrl(`/chats/${q(uuid)}${filterQuery(filter)}`),
  goalChat: (goalUuid: string) => connectUrl(`/goals/${q(goalUuid)}/chat`),
  settings: () => connectUrl('/settings'),
  plans: () => connectUrl('/plans'),
  blocked: () => connectUrl('/blocked'),
}

export const connectApi = {
  chats: (token?: string) => request<ChatList>(connectKeys.chats(), token),
  counts: (token?: string) => request<ChatCounts>(connectKeys.counts(), token),
  chat: (uuid: string, token?: string, filter: ChatFilter = {}) => request<Chat>(connectKeys.chat(uuid, filter), token),
  goalChat: (goalUuid: string, token?: string) => request<GoalChat>(connectKeys.goalChat(goalUuid), token),
  openDirect: (target: { handle?: string; user_uuid?: string }, token?: string) => request<Chat>(connectUrl('/chats/direct'), token, 'POST', target),
  send: (uuid: string, body: string, token?: string, options: SendOptions = {}) => request<SentMessage>(connectUrl(`/chats/${q(uuid)}/messages`), token, 'POST', {
    body, goal_uuid: options.scope?.goal_uuid, step_uuid: options.scope?.goal_uuid ? options.scope.step_uuid : undefined, share: options.share,
  }),
  plans: (token?: string) => request<ChatTopic[]>(connectKeys.plans(), token),
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
