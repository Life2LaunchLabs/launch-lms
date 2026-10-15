import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalUrl } from './goals'
import type { GoalStatus } from './types'

async function request<T = any>(url: string, token?: string, method = 'POST'): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, null, null, token))
  return errorHandling(response)
}

export interface GoalLifecycleResult { goal_uuid: string; status: GoalStatus; finished_at: string | null }

/** A goal's lifecycle: finish and reopen (personal goals), the one-time celebration, and delete. */
export const goalLifecycleApi = {
  finish: (goalUuid: string, token?: string) => request<GoalLifecycleResult>(goalUrl(goalUuid, '/finish'), token),
  reopen: (goalUuid: string, token?: string) => request<GoalLifecycleResult>(goalUrl(goalUuid, '/reopen'), token),
  celebrated: (goalUuid: string, token?: string) => request<{ goal_uuid: string; celebration_pending: boolean }>(goalUrl(goalUuid, '/celebrated'), token),
  remove: (goalUuid: string, token?: string) => request<{ deleted: boolean; goal_uuid: string }>(goalUrl(goalUuid), token, 'DELETE'),
}
