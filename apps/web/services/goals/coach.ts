import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { Goal } from './types'
import type { StepInput } from './goals'

const q = encodeURIComponent

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** Applying a Coach proposal: the whole goal, the row it made, and whether it was new, already there or since removed. */
export type CoachApplied<K extends string> = Goal & { applied: 'created' | 'existing' | 'removed' } & Record<K, string | null>

const coachUrl = (goalUuid: string, path: string) => `${getAPIUrl()}hub/goals/${q(goalUuid)}/coach${path}`

/**
 * Coach's proposals applied to a live goal. ``request_key`` is the proposal's local id, so
 * saving the same proposal twice never makes two stages or steps.
 */
export const goalCoachApi = {
  addStage: (goalUuid: string, data: { request_key: string; title: string; description?: string; timing?: string; start_date?: string | null; position?: number }, token?: string) =>
    request<CoachApplied<'created_stage_uuid'>>(coachUrl(goalUuid, '/stages'), token, 'POST', data),
  addStep: (goalUuid: string, data: StepInput & { request_key: string }, token?: string) =>
    request<CoachApplied<'created_step_uuid'>>(coachUrl(goalUuid, '/steps'), token, 'POST', data),
}
