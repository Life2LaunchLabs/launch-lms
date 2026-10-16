import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalsUrl, goalUrl } from './goals'

/** The launch flow: a draft goal, the launch activity, and the learner's run of it. */
export interface GoalLaunch {
  goal: { goal_uuid: string; title: string; status: string }
  activity: any
  run: any | null
}

/** A template the learner can start their goal from. */
export interface LaunchTemplate {
  template_uuid: string
  title: string
  description: string
  thumbnail_image: string
  stage_count: number
  step_count: number
}

const call = async <T,>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> =>
  errorHandling(await fetch(url, RequestBodyWithAuthHeader(method, body, null, token)))

export const launchTemplatesUrl = (goalUuid: string, q = '', limit = 3) =>
  goalUrl(goalUuid, `/launch/templates?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`)

export const goalLaunchApi = {
  /** A new draft goal, or the draft named, with its launch run. */
  start: (data: { org_id?: number | null; goal_uuid?: string }, token?: string) => call<GoalLaunch>(goalsUrl('/launch'), token, 'POST', data),
  get: (goalUuid: string, token?: string) => call<GoalLaunch>(goalUrl(goalUuid, '/launch'), token),
}
