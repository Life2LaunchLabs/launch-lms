import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

export type LearningPageType =
  | 'video'
  | 'standard'
  | 'info'
  | 'multiple_choice'
  | 'text_input'
  | 'question_response'

export async function getLearningBadgeCollections(
  orgId?: string | number,
  accessToken?: string,
  admin = false,
  next?: any
) {
  const search = new URLSearchParams({ admin: String(admin) })
  if (orgId !== undefined && orgId !== null && orgId !== '') search.set('org_id', String(orgId))
  const result = await fetch(
    `${getAPIUrl()}badge-collections/?${search.toString()}`,
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

export async function exportLearningBadgeCollection(collectionUuid: string, accessToken?: string) {
  const response = await fetch(
    `${getAPIUrl()}badge-collections/${collectionUuid}/export`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Export failed' }))
    throw new Error(error.detail || 'Export failed')
  }
  return response.blob()
}

export async function analyzeLearningBadgeImportPackage(file: File, orgId: string | number, accessToken?: string) {
  const formData = new FormData()
  formData.append('zip_file', file)
  const response = await fetch(
    `${getAPIUrl()}badge-import/analyze?org_id=${orgId}`,
    RequestBodyWithAuthHeader('POST', formData, null, accessToken)
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Import analysis failed' }))
    throw new Error(error.detail || 'Import analysis failed')
  }
  return response.json()
}

export async function importLearningBadgePackage(orgId: string | number, payload: any, accessToken?: string) {
  const response = await fetch(
    `${getAPIUrl()}badge-import/?org_id=${orgId}`,
    RequestBodyWithAuthHeader('POST', payload, null, accessToken)
  )
  return errorHandling(response)
}

export async function getLearningBadges(
  orgId?: string | number,
  accessToken?: string,
  admin = false,
  next?: any
) {
  const search = new URLSearchParams({ admin: String(admin) })
  if (orgId !== undefined && orgId !== null && orgId !== '') search.set('org_id', String(orgId))
  const result = await fetch(
    `${getAPIUrl()}badges/?${search.toString()}`,
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

export async function updateLearningBadgeThumbnail(badgeUuid: string, formData: FormData, accessToken: string) {
  const result = await fetch(
    `${getAPIUrl()}badges/${badgeUuid}/thumbnail`,
    RequestBodyFormWithAuthHeader('PUT', formData, null, accessToken)
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

export async function getLearningResponses(
  params: {
    org_id: string | number
    badge_uuid?: string
    activity_uuid?: string
    page_uuid?: string
    grading_status?: string
  },
  accessToken?: string
) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const result = await fetch(
    `${getAPIUrl()}learning-responses/?${search.toString()}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function gradeLearningResponse(attemptUuid: string, data: { score: number; feedback?: string }, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-responses/${attemptUuid}/grade`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
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

export async function getLearningBadgeAwards(orgId?: string | number, accessToken?: string) {
  const suffix = orgId ? `?org_id=${orgId}` : ''
  const result = await fetch(
    `${getAPIUrl()}badge-awards/${suffix}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function getLearningBadgeAward(awardUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-awards/${awardUuid}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function previewLearningBadgeCourseMigration(courseUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-migrations/course/${courseUuid}/preview`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function convertLearningBadgeCourseMigration(courseUuid: string, accessToken?: string, targetCollectionUuid?: string) {
  const suffix = targetCollectionUuid ? `?target_collection_uuid=${encodeURIComponent(targetCollectionUuid)}` : ''
  const result = await fetch(
    `${getAPIUrl()}badge-migrations/course/${courseUuid}/convert${suffix}`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function previewLearningBadgeCollectionMigration(collectionUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-migrations/collection/${collectionUuid}/preview`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function convertLearningBadgeCollectionMigration(collectionUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-migrations/collection/${collectionUuid}/convert`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result)
}
