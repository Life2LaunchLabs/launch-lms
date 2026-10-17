import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { HubLaunchCard, HubLaunchCardsSettings } from '@services/hub/launchCards'

// Platform › Coach: the one coaching policy every learner's Coach runs on.

export type CoachProvider = 'openai' | 'anthropic'
export type CoachTier = 'fast' | 'standard' | 'deep'
export const COACH_TIERS: CoachTier[] = ['fast', 'standard', 'deep']
export const PROVIDER_NAMES: Record<CoachProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic' }

export type CoachModelSettings = {
  max_output_tokens: number
  reasoning_effort: 'default' | 'none' | 'low' | 'medium' | 'high' | 'xhigh'
  verbosity: 'default' | 'low' | 'medium' | 'high'
  thinking_effort: 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

export type CoachTierConfig = { key_uuid: string; provider: CoachProvider | null; model: string; settings: CoachModelSettings }
export type CoachKey = { key_uuid: string; provider: CoachProvider; label: string; last_four: string; created_at: string; updated_at: string }
export type CoachAbility = { key: string; group: string; label: string; detail: string; enabled: boolean }
export type CoachTrigger = { key: string; label: string; detail: string; tier: CoachTier }
export type CoachPlaybook = { playbook_uuid: string; title: string; used_when: string; body: string; always: boolean; enabled: boolean; updated_at: string }
export type CoachRoutine = { routine_uuid: string; name: string; trigger: string; instructions: string; tier: CoachTier; enabled: boolean; updated_at: string }

export type CoachPolicy = {
  enabled: boolean
  method: string
  ability_groups: { key: string; label: string }[]
  abilities: CoachAbility[]
  tiers: Record<CoachTier, CoachTierConfig>
  tier_uses: Record<CoachTier, string[]>
  keys: CoachKey[]
  triggers: CoachTrigger[]
  routines: CoachRoutine[]
  playbooks: CoachPlaybook[]
  built_in_rules: { title: string; text: string }[]
  updated_at: string | null
}

export type CoachPolicyUpdate = {
  enabled?: boolean
  method?: string
  abilities?: Record<string, boolean>
  tiers?: Partial<Record<CoachTier, { key_uuid: string; model: string; settings: CoachModelSettings }>>
}

export type CoachModelOption = { id: string; name: string; description: string; available: boolean | null }
export type CoachModelCatalog = { provider: CoachProvider; source: 'curated' | 'live'; models: CoachModelOption[] }

export type CoachPlaybookWrite = Pick<CoachPlaybook, 'title' | 'used_when' | 'body' | 'always' | 'enabled'>
export type CoachRoutineWrite = Pick<CoachRoutine, 'name' | 'trigger' | 'instructions' | 'tier' | 'enabled'>

export const COACH_POLICY_PATH = 'superadmin/coach'

async function call<T>(path: string, token: string | undefined, method = 'GET', body: unknown = null): Promise<T> {
  const response = await fetch(`${getAPIUrl()}${COACH_POLICY_PATH}${path}`, RequestBodyWithAuthHeader(method, body, null, token))
  if (response.status === 204) return undefined as T
  return errorHandling(response) as Promise<T>
}

export const coachAdminApi = {
  get: (token?: string) => call<CoachPolicy>('', token),
  update: (payload: CoachPolicyUpdate, token?: string) => call<CoachPolicy>('', token, 'PUT', payload),

  createKey: (payload: { provider: CoachProvider; label: string; api_key: string }, token?: string) => call<CoachKey>('/keys', token, 'POST', payload),
  updateKey: (keyUuid: string, payload: { label?: string; api_key?: string }, token?: string) => call<CoachKey>(`/keys/${keyUuid}`, token, 'PATCH', payload),
  deleteKey: (keyUuid: string, token?: string) => call<void>(`/keys/${keyUuid}`, token, 'DELETE'),
  models: (keyUuid: string, token?: string) => call<CoachModelCatalog>(`/keys/${keyUuid}/models`, token),

  createPlaybook: (payload: CoachPlaybookWrite, token?: string) => call<CoachPlaybook>('/playbooks', token, 'POST', payload),
  updatePlaybook: (uuid: string, payload: CoachPlaybookWrite, token?: string) => call<CoachPlaybook>(`/playbooks/${uuid}`, token, 'PUT', payload),
  deletePlaybook: (uuid: string, token?: string) => call<void>(`/playbooks/${uuid}`, token, 'DELETE'),
  orderPlaybooks: (uuids: string[], token?: string) => call<CoachPlaybook[]>('/playbooks/order', token, 'PUT', { uuids }),

  createRoutine: (payload: CoachRoutineWrite, token?: string) => call<CoachRoutine>('/routines', token, 'POST', payload),
  updateRoutine: (uuid: string, payload: CoachRoutineWrite, token?: string) => call<CoachRoutine>(`/routines/${uuid}`, token, 'PUT', payload),
  deleteRoutine: (uuid: string, token?: string) => call<void>(`/routines/${uuid}`, token, 'DELETE'),
  orderRoutines: (uuids: string[], token?: string) => call<CoachRoutine[]>('/routines/order', token, 'PUT', { uuids }),

  launchCards: (token?: string) => call<HubLaunchCardsSettings>('/launch-cards', token),
  // Passing null restores the platform defaults.
  saveLaunchCards: (cards: HubLaunchCard[] | null, token?: string) => call<HubLaunchCardsSettings>('/launch-cards', token, 'PUT', { cards }),
}
