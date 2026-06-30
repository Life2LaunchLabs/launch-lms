import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

export type LearningPageType =
  | 'video'
  | 'info'
  | 'multiple_choice'
  | 'text_input'
  | 'question_response'

export async function getLearningBadgeCollections(
  orgId: string | number,
  accessToken?: string,
  admin = false,
  next?: any
) {
  const result = await fetch(
    `${getAPIUrl()}badge-collections/?org_id=${orgId}&admin=${admin}`,
    RequestBodyWithAuthHeader('GET', null, next, accessToken)
  )
  return getResponseMetadata(result)
}

export async function createLearningBadgeCollection(data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-collections/`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateLearningBadgeCollection(collectionUuid: string, data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-collections/${collectionUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function deleteLearningBadgeCollection(collectionUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-collections/${collectionUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function getLearningBadges(
  orgId: string | number,
  accessToken?: string,
  admin = false,
  next?: any
) {
  const result = await fetch(
    `${getAPIUrl()}badges/?org_id=${orgId}&admin=${admin}`,
    RequestBodyWithAuthHeader('GET', null, next, accessToken)
  )
  return getResponseMetadata(result)
}

export async function getLearningBadge(badgeUuid: string, accessToken?: string, next?: any) {
  const result = await fetch(
    `${getAPIUrl()}badges/${badgeUuid}`,
    RequestBodyWithAuthHeader('GET', null, next, accessToken)
  )
  return errorHandling(result)
}

export async function createLearningBadge(data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badges/`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function deleteLearningBadge(badgeUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badges/${badgeUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateLearningBadge(badgeUuid: string, data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badges/${badgeUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function getLearningPath(
  badgeUuid: string,
  accessToken?: string,
  includeRun = false,
  next?: any
) {
  const result = await fetch(
    `${getAPIUrl()}badges/${badgeUuid}/path?include_run=${includeRun}`,
    RequestBodyWithAuthHeader('GET', null, next, accessToken)
  )
  return errorHandling(result)
}

export async function createLearningActivity(data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-activities/`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateLearningActivity(activityUuid: string, data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-activities/${activityUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function duplicateLearningActivity(activityUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-activities/${activityUuid}/duplicate`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function deleteLearningActivity(activityUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-activities/${activityUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
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

export async function startLearningRun(badgeUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-runs/start/${badgeUuid}`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
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

export async function submitLearningResponse(runUuid: string, pageUuid: string, answer: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-runs/submit-response`,
    RequestBodyWithAuthHeader('POST', { run_uuid: runUuid, page_uuid: pageUuid, answer }, null, accessToken)
  )
  return errorHandling(result)
}

export async function conferLearningBadge(data: any, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-awards/confer`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}
