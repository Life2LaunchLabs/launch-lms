import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalUrl } from './goals'
import type { Goal, GoalStatus } from './types'

async function request<T = any>(url: string, token?: string, method = 'POST', body: unknown = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export interface GoalLifecycleResult { goal_uuid: string; status: GoalStatus; finished_at: string | null }

/** A goal's lifecycle: finish and reopen (personal goals), the one-time celebration, archive and delete. */
export const goalLifecycleApi = {
  /** Finishes a learner's own goal, with how they say it went for its story. */
  finish: (goalUuid: string, token?: string, said?: { reached?: Goal['finish']['reached'] | null; what_happened?: string }) => request<GoalLifecycleResult>(goalUrl(goalUuid, '/finish'), token, 'POST', said || null),
  reopen: (goalUuid: string, token?: string) => request<GoalLifecycleResult>(goalUrl(goalUuid, '/reopen'), token),
  celebrated: (goalUuid: string, token?: string) => request<{ goal_uuid: string; celebration_pending: boolean }>(goalUrl(goalUuid, '/celebrated'), token),
  /** Takes an organization's plan off the learner's list, for staff who may. */
  archive: (goalUuid: string, token?: string) => request<unknown>(goalUrl(goalUuid, '/archive'), token),
  remove: (goalUuid: string, token?: string) => request<{ deleted: boolean; goal_uuid: string }>(goalUrl(goalUuid), token, 'DELETE'),
}
