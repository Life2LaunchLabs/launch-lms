import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

export type IssuerAuthorizationStatus =
  | 'queued'
  | 'requested'
  | 'invited'
  | 'approved'
  | 'rejected'
  | 'revoked'
  | 'package_denied'

export async function browseMarketplaceBadges(
  issuerOrgId?: string | number,
  query?: string,
  accessToken?: string,
  next?: any
) {
  const search = new URLSearchParams()
  if (issuerOrgId !== undefined && issuerOrgId !== null && issuerOrgId !== '') {
    search.set('issuer_org_id', String(issuerOrgId))
  }
  if (query) search.set('q', query)
  const qs = search.toString()
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/badges${qs ? `?${qs}` : ''}`,
    RequestBodyWithAuthHeader('GET', null, next, accessToken)
  )
  return getResponseMetadata(result)
}

export async function getEligibleIssuers(badgeUuid: string, accessToken?: string, next?: any) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/badges/${badgeUuid}/eligible-issuers`,
    RequestBodyWithAuthHeader('GET', null, next, accessToken)
  )
  return getResponseMetadata(result)
}

export async function getIssuerAuthorizations(
  orgId: string | number,
  perspective: 'creator' | 'issuer',
  accessToken?: string,
  badgeUuid?: string,
  status?: string
) {
  const search = new URLSearchParams({ org_id: String(orgId), perspective })
  if (badgeUuid) search.set('badge_uuid', badgeUuid)
  if (status) search.set('status', status)
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/authorizations?${search.toString()}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function requestIssuerAuthorization(
  data: { badge_uuid: string; issuer_org_id: number; message?: string },
  accessToken?: string
) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/authorizations`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function inviteIssuerOrg(
  data: { badge_uuid: string; issuer_org_slug: string; message?: string },
  accessToken?: string
) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/authorizations/invite`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function approveIssuerAuthorization(authorizationUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/authorizations/${authorizationUuid}/approve`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function rejectIssuerAuthorization(authorizationUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/authorizations/${authorizationUuid}/reject`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function acceptIssuerInvite(authorizationUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/authorizations/${authorizationUuid}/accept`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function revokeIssuerAuthorization(authorizationUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/authorizations/${authorizationUuid}/revoke`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateIssuerAuthorization(
  authorizationUuid: string,
  data: { open_to_all?: boolean },
  accessToken?: string
) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/authorizations/${authorizationUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function getIssuerLearnerLinks(
  orgId: string | number,
  accessToken?: string,
  badgeUuid?: string
) {
  const search = new URLSearchParams({ org_id: String(orgId) })
  if (badgeUuid) search.set('badge_uuid', badgeUuid)
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/learner-links?${search.toString()}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function createIssuerLearnerLink(
  data: { badge_uuid: string; issuer_org_id: number; user_id: number; note?: string },
  accessToken?: string
) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/learner-links`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function deleteIssuerLearnerLink(linkUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/learner-links/${linkUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function getCreatorIssuanceMetrics(orgId: string | number, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/metrics/creator?org_id=${orgId}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return getResponseMetadata(result)
}
