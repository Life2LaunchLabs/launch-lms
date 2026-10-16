import { getAPIUrl } from '@services/config/config'
import type { ResourceType } from '@services/resources/resources'
import type { StepConfigs, StepTypeKey } from '@services/goals/types'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { HubQuestion } from './questions'


export type HubSurfaceHint = {
  surface: 'goal' | 'goals' | 'group_goal' | 'unsupported'
  entity_id?: string
  selected_step_id?: string
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
  // Receipts saved before goals carry objective_title instead of step_title.
  sources: Array<{ source_type?: 'group_goal' | 'group_plan'; goal_id?: string; assignment_id?: string; title: string; step_id?: string; step_title?: string; objective_title?: string; updated_at: string; page_path?: string; page_title?: string }>
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
  questions?: HubQuestion[]
}

export type HubSuggestedAction = {
  action_id: string
  schema_version: 1
  capability: 'navigate'
  destination: string
  label: string
  state: 'proposed'
  primary_behavior?: 'navigate' | 'begin_edit'
  primary_label?: string
  alternate_label?: string
  edit_scope?: { kind: HubEditScopeKind | 'new_plan' | 'plan'; label: string; target_uuid?: string }
}

export type HubEditRunEvent = {
  event_uuid: string
  sequence: number
  kind: string
  summary: string
  object_type?: string | null
  object_uuid?: string | null
  object_label?: string | null
  transient: boolean
  payload: Record<string, unknown>
  created_at: string
}

/** A stage Coach proposes; ``local_id`` is its edit object key and its request key when saved. */
export type HubProposedStage = { local_id: string; title: string; description: string; timing: string }

/** A typed step Coach proposes, its config already checked by the step registry. */
export type HubProposedStep = {
  local_id: string
  type: StepTypeKey
  title: string
  description: string
  config: StepConfigs[StepTypeKey]
  due_date: string
  stage_title: string
  materials?: Array<Record<string, unknown>>
}

type ChangeBase = { local_id: string; reason: string }
/** A change Coach suggests to a step the goal has; ``from`` is the row as it was when suggested. */
export type HubStepChange = ChangeBase & { step_uuid: string; remove: boolean; title?: string; description?: string; stage_uuid?: string; stage_title?: string; from: { title: string; description: string; stage_title: string } }
export type HubStageChange = ChangeBase & { stage_uuid: string; remove: boolean; title?: string; milestone?: string; timing?: string; from: { title: string; milestone: string; timing: string } }
export type HubGoalDetailsChange = ChangeBase & { title?: string; description?: string; from: { title: string; description: string } }

export type HubEditOperation = {
  operation_id: string
  type: 'set_new_goal_details'
  object_type: 'goal'
  object_uuid?: string | null
  object_label: string
  fields: { title: string; description: string; target_date: string }
} | {
  operation_id: string
  type: 'add_goal_stages'
  object_type: 'stage'
  object_uuid?: string | null
  object_label: string
  stages: HubProposedStage[]
} | {
  operation_id: string
  type: 'add_goal_steps'
  object_type: 'step'
  object_uuid?: string | null
  object_label: string
  steps: HubProposedStep[]
} | {
  operation_id: string
  type: 'change_goal_steps'
  object_type: 'step'
  object_uuid?: string | null
  object_label: string
  changes: HubStepChange[]
} | {
  operation_id: string
  type: 'change_goal_stages'
  object_type: 'stage'
  object_uuid?: string | null
  object_label: string
  changes: HubStageChange[]
} | {
  operation_id: string
  type: 'set_goal_details'
  object_type: 'goal'
  object_uuid?: string | null
  object_label: string
  changes: HubGoalDetailsChange[]
} | {
  operation_id: string
  type: 'propose_edit_conclusion'
  object_type: 'run'
  object_uuid?: string | null
  object_label: string
  summary: string
}

/** What a run may edit: a goal still being created, or one saved goal. */
export type HubEditScopeKind = 'new_goal' | 'goal'

export type HubEditRun = {
  run_uuid: string
  conversation_uuid: string
  goal: string
  scope: { kind: HubEditScopeKind; target_uuid?: string | null; label: string; route: string }
  status: 'active' | 'cancelled' | 'completed'
  created_at: string
  updated_at: string
  ended_at?: string | null
  events: HubEditRunEvent[]
  objects: HubEditObjectState[]
}

export type HubEditObjectState = {
  object_key: string
  object_type: string
  object_uuid?: string | null
  status: 'editing' | 'cancelled' | 'saved' | 'expired'
  current_fields: Record<string, string | number | boolean | null>
  proposal_fields: Record<string, string | number | boolean | null>
  revision: number
  updated_at: string
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

async function hubRequest<T>(path: string, method: string, accessToken: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${getAPIUrl()}hub/${path}`, { ...RequestBodyWithAuthHeader(method, data ?? null, null, accessToken), signal })
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
  signal?: AbortSignal,
): Promise<{
  answer: string
  page_context?: HubPageReceipt
  usage: { input_tokens: number; output_tokens: number }
  resources: HubAdvisorResource[]
  memories_used: HubMemory[]
  memory_changes: HubMemory[]
  suggested_actions: HubSuggestedAction[]
  edit_operations: HubEditOperation[]
  edit_run?: HubEditRun | null
  questions?: HubQuestion[]
} & ConversationWriteResult> {
  // The API reconstructs established threads from its owned transcript. Sending only
  // the new turn prevents stale or oversized rendered history from poisoning a retry.
  const requestMessages = conversationUuid ? messages.slice(-1) : messages
  const response = await fetch(
    `${getAPIUrl()}hub/advisor?org_id=${encodeURIComponent(orgId)}`,
    {
      ...RequestBodyWithAuthHeader(
        'POST',
        {
        messages: requestMessages.map(({ role, content }) => ({ role, content })),
        resource_uuids: resourceUuids,
        learner_resource_uuids: learnerResourceUuids,
        conversation_uuid: conversationUuid,
        surface,
      },
        null,
        accessToken
      ),
      signal,
    }
  )
  return errorHandling(response)
}

export function resolveHubSuggestedAction(
  orgId: number,
  conversationUuid: string,
  messageUuid: string,
  actionId: string,
  accessToken: string,
  mode: 'navigate' | 'edit' = 'navigate',
) {
  return hubRequest<{ action_id: string; route: string; label: string; edit_run?: HubEditRun }>(
    `actions/${encodeURIComponent(actionId)}/resolve?org_id=${encodeURIComponent(orgId)}`,
    'POST',
    accessToken,
    { conversation_uuid: conversationUuid, message_uuid: messageUuid, mode },
  )
}

export function getActiveHubEditRun(orgId: number, conversationUuid: string, accessToken: string) {
  return hubRequest<{ edit_run: HubEditRun | null }>(`conversations/${encodeURIComponent(conversationUuid)}/edit-run?org_id=${encodeURIComponent(orgId)}`, 'GET', accessToken)
}

export function concludeHubEditRun(orgId: number, runUuid: string, status: 'cancelled' | 'completed', accessToken: string) {
  return hubRequest<HubEditRun>(`edit-runs/${encodeURIComponent(runUuid)}/conclude?org_id=${encodeURIComponent(orgId)}`, 'POST', accessToken, { status })
}

export function reopenHubEditRun(orgId: number, runUuid: string, accessToken: string) {
  return hubRequest<HubEditRun>(`edit-runs/${encodeURIComponent(runUuid)}/reopen?org_id=${encodeURIComponent(orgId)}`, 'POST', accessToken)
}

export function updateHubEditRunGoal(orgId: number, runUuid: string, goal: string, accessToken: string) {
  return hubRequest<HubEditRun>(`edit-runs/${encodeURIComponent(runUuid)}/goal?org_id=${encodeURIComponent(orgId)}`, 'PATCH', accessToken, { goal })
}

/** Points a new-goal run at the personal goal the learner just saved, so Coach can keep building it. */
export function bindHubEditRunGoal(orgId: number, runUuid: string, goalUuid: string, accessToken: string) {
  return hubRequest<HubEditRun>(`edit-runs/${encodeURIComponent(runUuid)}/goal-target?org_id=${encodeURIComponent(orgId)}`, 'POST', accessToken, { goal_uuid: goalUuid })
}

/** The learner asks Coach to plan their goal with them; an active session on the goal is returned as it is. */
export function startGoalCoachSession(orgId: number, goalUuid: string, accessToken: string, conversationUuid?: string | null) {
  return hubRequest<HubEditRun>(`goals/${encodeURIComponent(goalUuid)}/coach/session?org_id=${encodeURIComponent(orgId)}`, 'POST', accessToken, { conversation_uuid: conversationUuid || null })
}

/** One session's suggestions on a goal that are still waiting, from an active or an ended session. */
export type GoalSuggestionRun = { run_uuid: string; active: boolean; operations: HubEditOperation[]; objects: HubEditObjectState[] }

export const goalSuggestionsKey = (orgId: number, goalUuid: string) => `hub/goals/${goalUuid}/coach/suggestions?org_id=${orgId}`

export function getGoalCoachSuggestions(orgId: number, goalUuid: string, accessToken: string) {
  return hubRequest<{ runs: GoalSuggestionRun[] }>(`goals/${encodeURIComponent(goalUuid)}/coach/suggestions?org_id=${encodeURIComponent(orgId)}`, 'GET', accessToken)
}

export function saveHubEditObjectState(
  orgId: number,
  runUuid: string,
  objectKey: string,
  state: Pick<HubEditObjectState, 'object_type' | 'current_fields' | 'proposal_fields' | 'status'> & { expected_revision?: number; object_uuid?: string | null },
  accessToken: string,
) {
  return hubRequest<HubEditObjectState>(`edit-runs/${encodeURIComponent(runUuid)}/objects/${encodeURIComponent(objectKey)}?org_id=${encodeURIComponent(orgId)}`, 'PUT', accessToken, state)
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
  signal?: AbortSignal
} = {}) {
  return hubRequest<ConversationWriteResult>(`conversations/search?org_id=${encodeURIComponent(orgId)}`, 'POST', accessToken, {
    conversation_uuid: options.conversationUuid,
    query,
    resource_uuids: options.resourceUuids || [],
    learner_resource_uuids: options.learnerResourceUuids || [],
    surface: options.surface,
  }, options.signal)
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
