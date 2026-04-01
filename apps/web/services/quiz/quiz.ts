import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests'

const base = () => `${getAPIUrl()}quizzes`

export async function submitQuizAttempt(
  activityUuid: string,
  payload: { answers: { question_uuid: string; answer_json: any }[] },
  access_token?: string
) {
  const res = await fetch(
    `${base()}/${activityUuid}/attempts`,
    RequestBodyWithAuthHeader('POST', payload, null, access_token)
  )
  if (!res.ok) throw new Error('Failed to submit quiz')
  return res.json()
}

export async function getMyQuizResult(
  activityUuid: string,
  access_token?: string
): Promise<any | null> {
  const res = await fetch(
    `${base()}/${activityUuid}/my-result`,
    RequestBodyWithAuthHeader('GET', null, null, access_token)
  )
  if (res.status === 404) return null
  if (!res.ok) return null
  return res.json()
}

export async function updateQuizScoring(
  activityUuid: string,
  data: { scoring_vectors?: any[]; option_scores?: Record<string, any>; text_scores?: Record<string, any>; category_scoring_vectors?: any[]; graded_scoring_vectors?: any[] },
  access_token: string
) {
  const res = await fetch(
    `${base()}/${activityUuid}/scoring`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token)
  )
  if (!res.ok) throw new Error('Failed to update scoring')
  return res.json()
}

export async function updateQuizCategories(
  activityUuid: string,
  data: { category_sets: any[] },
  access_token: string
) {
  const res = await fetch(
    `${base()}/${activityUuid}/categories`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token)
  )
  if (!res.ok) throw new Error('Failed to update categories')
  return res.json()
}

export async function updateQuizResults(
  activityUuid: string,
  data: { result_options: any[] },
  access_token: string
) {
  const res = await fetch(
    `${base()}/${activityUuid}/results`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token)
  )
  if (!res.ok) throw new Error('Failed to update results')
  return res.json()
}

export async function updateQuizSettings(
  activityUuid: string,
  data: { quiz_mode?: 'categories' | 'graded'; grading_rules?: any },
  access_token: string
) {
  const res = await fetch(
    `${base()}/${activityUuid}/settings`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token)
  )
  if (!res.ok) throw new Error('Failed to update quiz settings')
  return res.json()
}
