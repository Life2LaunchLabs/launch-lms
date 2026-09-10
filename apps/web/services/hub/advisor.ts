import { getAPIUrl } from '@services/config/config'
import type { ResourceType } from '@services/resources/resources'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'


export type HubSurfaceHint = {
  surface: 'plan' | 'plans' | 'group_plan' | 'unsupported'
  entity_id?: string
  selected_objective_id?: string
  visible_ids?: string[]
  page_path?: string
  page_title?: string
}
export type HubPageReceipt = {
  status: 'off' | 'unavailable' | 'ready'
  captured_at: string
  page_path?: string
  page_title?: string
  truncated?: boolean
  sources: Array<{ source_type?: 'group_plan'; plan_id: string; assignment_id?: string; title: string; objective_id?: string; objective_title?: string; updated_at: string; page_path?: string; page_title?: string }>
}

export type HubAdvisorResource = {
  resource_uuid: string
  title: string
  description: string | null
  resource_type: ResourceType
  provider_name: string | null
  external_url: string
  cover_image_url: string | null
  thumbnail_image: string | null
  owner_org_uuid: string | null
  access_mode: string
  tags: string[]
}

export type HubAdvisorMessage = {
  role: 'user' | 'assistant'
  content: string
  page_context?: HubPageReceipt | null
  resources?: HubAdvisorResource[]
  suggested_actions?: HubSuggestedAction[]
}

export type HubSuggestedAction = {
  action_id: string
  schema_version: 1
  capability: 'navigate'
  destination: string
  label: string
  state: 'proposed'
}

export type HubMemory = {
  memory_uuid: string
  category: 'goal' | 'preference' | 'constraint' | 'background'
  content: string
  version: number
  explicit?: boolean
  created_at?: string
  updated_at?: string
  last_used_at?: string | null
  relationship?: 'used' | 'created' | 'updated' | 'deleted'
  editable?: boolean
}

export type HubConversationMessage = HubAdvisorMessage & {
  id: string
  resource_label?: 'You added' | 'Suggested'
  search_query?: string
  created_at?: string
  memories?: HubMemory[]
}

export type HubConversationSummary = {
  conversation_uuid: string
  title: string
  created_at: string
  updated_at: string
  resource_count: number
  latest_user_message: string
  latest_user_resource_count: number
}

export type HubConversation = HubConversationSummary & {
  messages: HubConversationMessage[]
  context_resources: HubAdvisorResource[]
}

type ConversationWriteResult = {
  conversation_uuid: string
  title: string
  user_message_uuid: string
  assistant_message_uuid: string
  user_message_created_at: string
  assistant_message_created_at: string
  page_context?: HubPageReceipt
}

async function hubRequest<T>(path: string, method: string, accessToken: string, data?: unknown): Promise<T> {
  const response = await fetch(`${getAPIUrl()}hub/${path}`, RequestBodyWithAuthHeader(method, data ?? null, null, accessToken))
  if (!response.ok) return errorHandling(response)
  if (response.status === 204) return undefined as T
  return response.json()
}

export async function askHubAdvisor(
  orgId: number,
  messages: HubAdvisorMessage[],
  accessToken: string,
  resourceUuids: string[] = [],
  conversationUuid?: string,
  learnerResourceUuids: string[] = [],
  surface?: HubSurfaceHint,
): Promise<{
  answer: string
  page_context?: HubPageReceipt
  usage: { input_tokens: number; output_tokens: number }
  resources: HubAdvisorResource[]
  memories_used: HubMemory[]
  memory_changes: HubMemory[]
  suggested_actions: HubSuggestedAction[]
} & ConversationWriteResult> {
  const response = await fetch(
    `${getAPIUrl()}hub/advisor?org_id=${encodeURIComponent(orgId)}`,
    RequestBodyWithAuthHeader(
      'POST',
      {
        messages: messages.map(({ role, content }) => ({ role, content })),
        resource_uuids: resourceUuids,
        learner_resource_uuids: learnerResourceUuids,
        conversation_uuid: conversationUuid,
        surface,
      },
      null,
      accessToken
    )
  )
  return errorHandling(response)
}

export function resolveHubSuggestedAction(
  orgId: number,
  conversationUuid: string,
  messageUuid: string,
  actionId: string,
  accessToken: string,
) {
  return hubRequest<{ action_id: string; route: string; label: string }>(
    `actions/${encodeURIComponent(actionId)}/resolve?org_id=${encodeURIComponent(orgId)}`,
    'POST',
    accessToken,
    { conversation_uuid: conversationUuid, message_uuid: messageUuid },
  )
}

export function getHubMemory(orgId: number, accessToken: string) {
  return hubRequest<{ enabled: boolean; notice_dismissed: boolean; memories: HubMemory[] }>(`memory?org_id=${encodeURIComponent(orgId)}`, 'GET', accessToken)
}

export function setHubMemoryEnabled(orgId: number, enabled: boolean, accessToken: string) {
  return updateHubMemorySettings(orgId, { enabled }, accessToken)
}

export function updateHubMemorySettings(
  orgId: number,
  settings: { enabled?: boolean; notice_dismissed?: boolean },
  accessToken: string,
) {
  return hubRequest<{ enabled: boolean; notice_dismissed: boolean }>(`memory/settings?org_id=${encodeURIComponent(orgId)}`, 'PATCH', accessToken, settings)
}

export function updateHubMemory(orgId: number, memoryUuid: string, content: string, accessToken: string) {
  return hubRequest<HubMemory>(`memory/${encodeURIComponent(memoryUuid)}?org_id=${encodeURIComponent(orgId)}`, 'PATCH', accessToken, { content })
}

export function deleteHubMemory(orgId: number, memoryUuid: string, accessToken: string) {
  return hubRequest<void>(`memory/${encodeURIComponent(memoryUuid)}?org_id=${encodeURIComponent(orgId)}`, 'DELETE', accessToken)
}

export function clearHubMemory(orgId: number, accessToken: string) {
  return hubRequest<void>(`memory?org_id=${encodeURIComponent(orgId)}`, 'DELETE', accessToken)
}

export function listHubConversations(orgId: number, accessToken: string) {
  return hubRequest<HubConversationSummary[]>(`conversations?org_id=${encodeURIComponent(orgId)}`, 'GET', accessToken)
}

export function getHubConversation(orgId: number, conversationUuid: string, accessToken: string) {
  return hubRequest<HubConversation>(`conversations/${encodeURIComponent(conversationUuid)}?org_id=${encodeURIComponent(orgId)}`, 'GET', accessToken)
}

export function recordHubSearch(orgId: number, query: string, accessToken: string, options: {
  conversationUuid?: string
  resourceUuids?: string[]
  learnerResourceUuids?: string[]
  surface?: HubSurfaceHint
} = {}) {
  return hubRequest<ConversationWriteResult>(`conversations/search?org_id=${encodeURIComponent(orgId)}`, 'POST', accessToken, {
    conversation_uuid: options.conversationUuid,
    query,
    resource_uuids: options.resourceUuids || [],
    learner_resource_uuids: options.learnerResourceUuids || [],
    surface: options.surface,
  })
}

export function renameHubConversation(orgId: number, conversationUuid: string, title: string, accessToken: string) {
  return hubRequest<{ conversation_uuid: string; title: string }>(`conversations/${encodeURIComponent(conversationUuid)}?org_id=${encodeURIComponent(orgId)}`, 'PATCH', accessToken, { title })
}

export function archiveHubConversation(orgId: number, conversationUuid: string, accessToken: string) {
  return hubRequest<{ conversation_uuid: string; archived: boolean }>(`conversations/${encodeURIComponent(conversationUuid)}?org_id=${encodeURIComponent(orgId)}`, 'PATCH', accessToken, { archived: true })
}

export function deleteHubConversation(orgId: number, conversationUuid: string, accessToken: string) {
  return hubRequest<void>(`conversations/${encodeURIComponent(conversationUuid)}?org_id=${encodeURIComponent(orgId)}`, 'DELETE', accessToken)
}

export function saveHubConversationState(orgId: number, conversationUuid: string, accessToken: string, state: {
  context_resource_uuids: string[]
  message_resources: Array<{ message_uuid: string; resource_uuids: string[]; label?: 'You added' | 'Suggested' }>
}) {
  return hubRequest<void>(`conversations/${encodeURIComponent(conversationUuid)}/state?org_id=${encodeURIComponent(orgId)}`, 'PUT', accessToken, state)
}
