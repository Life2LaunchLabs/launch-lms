import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { EntryKind, Goal, GoalIcon, GoalSummary, StepCompleter, StepStatus, StepTypeKey } from './types'

const q = encodeURIComponent

export const goalsUrl = (path = '') => `${getAPIUrl()}goals${path}`
export const goalUrl = (goalUuid: string, path = '') => goalsUrl(`/${q(goalUuid)}${path}`)

// Any SWR key under /goals, for revalidating everything goal-related after a change.
export const isGoalsKey = (key: unknown) => typeof key === 'string' && key.startsWith(goalsUrl())

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export interface StepInput {
  stage_uuid?: string | null
  position?: number
  type: StepTypeKey
  title: string
  description?: string
  config?: Record<string, unknown>
  materials?: Array<Record<string, unknown>>
  completed_by?: StepCompleter
  review_required?: boolean
  reviewer_guidance?: string
  after_step_uuids?: string[]
  start_date?: string | null
  due_date?: string | null
}

export interface EntryInput {
  kind: EntryKind
  slot?: string | null
  title?: string
  url?: string
  asset_uuid?: string | null
  resource_uuid?: string | null
  note?: string
  data?: Record<string, unknown>
}

const step = (goalUuid: string, stepUuid: string, path = '') => goalUrl(goalUuid, `/steps/${q(stepUuid)}${path}`)

export const goalsApi = {
  list: (token?: string, includeFinished = true) => request<GoalSummary[]>(goalsUrl(`?include_finished=${includeFinished}`), token),
  get: (goalUuid: string, token?: string) => request<Goal>(goalUrl(goalUuid), token),
  create: (data: { title: string; description?: string; org_id?: number | null; target_date?: string | null }, token?: string) => request<Goal>(goalsUrl(), token, 'POST', data),
  update: (goalUuid: string, data: { title?: string; description?: string; target_date?: string | null; icon?: GoalIcon | null }, token?: string) => request<Goal>(goalUrl(goalUuid), token, 'PATCH', data),
  respond: (goalUuid: string, accept: boolean, token?: string) => request<Goal>(goalUrl(goalUuid, '/respond'), token, 'POST', { accept }),

  addStage: (goalUuid: string, data: { title: string; description?: string; timing?: string; milestone?: string; position?: number }, token?: string) => request<Goal>(goalUrl(goalUuid, '/stages'), token, 'POST', data),
  /** Moves the goal on (or back) to a stage. */
  setCurrentStage: (goalUuid: string, stageUuid: string, token?: string) => request<Goal>(goalUrl(goalUuid, '/stages/current'), token, 'PUT', { stage_uuid: stageUuid }),
  reorderStages: (goalUuid: string, stageUuids: string[], token?: string) => request<Goal>(goalUrl(goalUuid, '/stages/order'), token, 'PUT', { stage_uuids: stageUuids }),
  updateStage: (goalUuid: string, stageUuid: string, data: { title?: string; description?: string; timing?: string; milestone?: string; start_date?: string | null }, token?: string) => request<Goal>(goalUrl(goalUuid, `/stages/${q(stageUuid)}`), token, 'PATCH', data),
  deleteStage: (goalUuid: string, stageUuid: string, token?: string) => request<Goal>(goalUrl(goalUuid, `/stages/${q(stageUuid)}`), token, 'DELETE'),

  addStep: (goalUuid: string, data: StepInput, token?: string) => request<Goal>(goalUrl(goalUuid, '/steps'), token, 'POST', data),
  updateStep: (goalUuid: string, stepUuid: string, data: Partial<Omit<StepInput, 'type' | 'stage_uuid' | 'position'>> & { held?: boolean }, token?: string) => request<Goal>(step(goalUuid, stepUuid), token, 'PATCH', data),
  moveStep: (goalUuid: string, stepUuid: string, data: { stage_uuid: string | null; position: number }, token?: string) => request<Goal>(step(goalUuid, stepUuid, '/move'), token, 'PUT', data),
  deleteStep: (goalUuid: string, stepUuid: string, token?: string) => request<Goal>(step(goalUuid, stepUuid), token, 'DELETE'),

  setStatus: (goalUuid: string, stepUuid: string, status: StepStatus, note?: string, token?: string) => request<Goal>(step(goalUuid, stepUuid, '/status'), token, 'PUT', { status, note }),
  saveSubmission: (goalUuid: string, stepUuid: string, data: { submission?: Record<string, unknown>; answer?: string; learner_note?: string }, token?: string) => request<Goal>(step(goalUuid, stepUuid, '/submission'), token, 'PUT', data),
  addEntry: (goalUuid: string, stepUuid: string, data: EntryInput, token?: string) => request<Goal>(step(goalUuid, stepUuid, '/entries'), token, 'POST', data),
  updateEntry: (goalUuid: string, stepUuid: string, entryUuid: string, data: { title?: string; note?: string; done?: boolean; follow_up_status?: string | null; data?: Record<string, unknown> }, token?: string) => request<Goal>(step(goalUuid, stepUuid, `/entries/${q(entryUuid)}`), token, 'PATCH', data),
  deleteEntry: (goalUuid: string, stepUuid: string, entryUuid: string, token?: string) => request<Goal>(step(goalUuid, stepUuid, `/entries/${q(entryUuid)}`), token, 'DELETE'),
  startActivity: (goalUuid: string, stepUuid: string, token?: string) => request(step(goalUuid, stepUuid, '/activity'), token, 'POST'),
}
