import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalUrl } from './goals'

/** A finished goal's story: the generated activity the story player plays. */
export interface GoalStory {
  goal: { goal_uuid: string; title: string }
  story: { story_uuid: string; version: number; status: string }
  activity: any
}

export const goalStoryApi = {
  get: async (goalUuid: string, token?: string): Promise<GoalStory> =>
    errorHandling(await fetch(goalUrl(goalUuid, '/story'), RequestBodyWithAuthHeader('GET', null, null, token))),
}
