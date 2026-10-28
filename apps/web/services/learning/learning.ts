import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
} from '@services/utils/ts/requests'

export type LearningPageType =
  | 'video'
  | 'standard'
  | 'info'
  | 'multiple_choice'
  | 'text_input'
  | 'question_response'

export async function updateLearningActivity(activityUuid: string, data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-activities/${activityUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function createLearningPage(data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-pages/`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateLearningPage(pageUuid: string, data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-pages/${pageUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function deleteLearningPage(pageUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-pages/${pageUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function uploadLearningPageMedia(pageUuid: string, formData: FormData, accessToken: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-pages/${pageUuid}/media`,
    RequestBodyFormWithAuthHeader('POST', formData, null, accessToken)
  )
  return errorHandling(result)
}

export async function getLearningVariables(orgId: string | number, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-variables/?org_id=${orgId}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function createLearningVariable(data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-variables/`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateLearningVariable(variableUuid: string, data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-variables/${variableUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function deleteLearningVariable(variableUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-variables/${variableUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function completeLearningPage(runUuid: string, pageUuid: string, data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-runs/complete-page`,
    RequestBodyWithAuthHeader('POST', { run_uuid: runUuid, page_uuid: pageUuid, data }, null, accessToken)
  )
  return errorHandling(result)
}

export async function submitLearningResponse(runUuid: string, pageUuid: string, answer: any, accessToken?: string, button?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-runs/submit-response`,
    RequestBodyWithAuthHeader('POST', { run_uuid: runUuid, page_uuid: pageUuid, answer, ...(button ? { button } : {}) }, null, accessToken)
  )
  return errorHandling(result)
}

export async function gradeLearningResponse(attemptUuid: string, data: { score: number; feedback?: string; question_scores?: Record<string, number>; question_feedback?: Record<string, string> }, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-responses/${attemptUuid}/grade`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}


/** Staff decide on a run that didn't reach the pass mark: pass it, or reopen it to try again. */
export async function decideLearningRun(runUuid: string, data: { passed: boolean; note?: string }, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-runs/${runUuid}/decision`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}
