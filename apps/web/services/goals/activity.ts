import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalsApi, goalUrl } from './goals'

/** What an activity step plays: the activity with its pages, and the learner's run once they started it. */
export interface GoalStepActivity {
  goal: { goal_uuid: string; title: string }
  step: { step_uuid: string; title: string; description: string }
  activity: any
  run: any | null
}

/** The run a learner gets when they start (or resume) an activity step. */
export interface GoalActivityStart { goal_uuid: string; step_uuid: string; activity_uuid: string; run: any }

const path = (stepUuid: string) => `/steps/${encodeURIComponent(stepUuid)}/activity`

export const goalActivityApi = {
  get: async (goalUuid: string, stepUuid: string, token?: string): Promise<GoalStepActivity> =>
    errorHandling(await fetch(goalUrl(goalUuid, path(stepUuid)), RequestBodyWithAuthHeader('GET', null, null, token))),
  start: (goalUuid: string, stepUuid: string, token?: string) => goalsApi.startActivity(goalUuid, stepUuid, token) as Promise<GoalActivityStart>,
}
