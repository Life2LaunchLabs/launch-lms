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

// open: learners start immediately · request: learners ask and the issuer accepts · invite: issuer adds learners
export type LearnerAccess = 'open' | 'request' | 'invite'

export async function getBadgeIssuingSettings(badgeUuid: string, accessToken?: string) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/badges/${badgeUuid}/issuing`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateBadgeIssuingSettings(
  badgeUuid: string,
  data: { creator_access?: LearnerAccess | 'none'; default_issuer_org_id?: number; clear_default_issuer?: boolean },
  accessToken?: string
) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/badges/${badgeUuid}/issuing`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateIssuerAuthorization(
  authorizationUuid: string,
  data: { open_to_all?: boolean; learner_access?: LearnerAccess },
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

export async function requestIssuerLearnerSupport(
  data: { badge_uuid: string; issuer_org_id: number; message?: string },
  accessToken?: string
) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/learner-requests`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result)
}

export async function decideIssuerLearnerRequest(
  linkUuid: string,
  decision: 'accept' | 'reject',
  data: { staff_user_ids?: number[]; note?: string },
  accessToken?: string
) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/learner-requests/${linkUuid}/${decision}`,
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

export async function getIssuerBadgeMetrics(
  orgId: string | number,
  badgeUuid: string,
  accessToken?: string
) {
  const search = new URLSearchParams({ org_id: String(orgId), badge_uuid: badgeUuid })
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/metrics/issuer?${search.toString()}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return getResponseMetadata(result)
}

// Plan templates in the marketplace (permission is to use a plan; badges stay the badge side's call) ------------

export type TemplateListingMode = 'locked' | 'open'
export type TemplateListingAccess = 'open' | 'request'
export type TemplateAuthorizationStatus = 'requested' | 'approved' | 'rejected' | 'revoked'

export interface MarketplaceOrg { id: number; name: string; slug: string; logo_image?: string | null; org_uuid?: string }

export interface TemplateListing {
  listed: boolean
  mode: TemplateListingMode
  access: TemplateListingAccess
  listed_at: string | null
  usage?: { approved: number; requested: number }
  published_version?: number | null
}

export interface TemplateAuthorization {
  authorization_uuid: string
  status: TemplateAuthorizationStatus
  message: string
  creation_date: string
  update_date: string
  decided_at: string | null
  template: { template_uuid: string; title: string; thumbnail_image?: string | null; mode: TemplateListingMode | null } | null
  creator_org: MarketplaceOrg | null
  issuer_org: MarketplaceOrg | null
  copied_template_uuid: string | null
  /** Creator side only: plans the issuer runs on it (counts only). */
  learner_count?: number
}

export interface MarketplaceTemplate extends TemplateListing {
  template_uuid: string
  title: string
  description: string
  thumbnail_image: string | null
  published_version: number | null
  stage_count: number
  step_count: number
  creator_org: MarketplaceOrg | null
  is_own: boolean
  badges: { badge_uuid: string; name: string; thumbnail_image: string; route_uuid: string; trusted_only: boolean }[]
  frameworks: { framework_uuid: string; name: string; node_count: number }[]
  requirement_count: number
  authorization: TemplateAuthorization | null
}

export interface MarketplaceRequestsSummary {
  incoming_requested: number
  outgoing_pending: number
  badges: { incoming_requested: number; outgoing_pending: number }
  templates: { incoming_requested: number; outgoing_pending: number }
}

async function marketplaceRequest<T = any>(path: string, accessToken?: string, method = 'GET', body: any = null): Promise<T> {
  const result = await fetch(`${getAPIUrl()}badge-marketplace/${path}`, RequestBodyWithAuthHeader(method, body, null, accessToken))
  return errorHandling(result)
}

const qs = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') search.set(key, String(value)) })
  return search.toString()
}

/** SWR keys for the marketplace start with this, to revalidate after a request or decision. */
export const MARKETPLACE_KEY = 'marketplace'
export const isMarketplaceKey = (key: unknown) => Array.isArray(key) && key[0] === MARKETPLACE_KEY

export const templateMarketplaceApi = {
  summary: (orgId: number, accessToken?: string) => marketplaceRequest<MarketplaceRequestsSummary>(`requests/summary?org_id=${orgId}`, accessToken),
  browse: (orgId: number, query = '', accessToken?: string, creatorOrgId?: number | null) => marketplaceRequest<MarketplaceTemplate[]>(`templates?${qs({ org_id: orgId, q: query, creator_org_id: creatorOrgId })}`, accessToken),
  listing: (orgId: number, templateUuid: string, accessToken?: string) => marketplaceRequest<TemplateListing>(`templates/${encodeURIComponent(templateUuid)}/listing?org_id=${orgId}`, accessToken),
  setListing: (orgId: number, templateUuid: string, data: { listed: boolean; mode: TemplateListingMode; access: TemplateListingAccess }, accessToken?: string) =>
    marketplaceRequest<TemplateListing>(`templates/${encodeURIComponent(templateUuid)}/listing?org_id=${orgId}`, accessToken, 'PUT', data),
  copy: (orgId: number, templateUuid: string, accessToken?: string) => marketplaceRequest<{ template_uuid: string; title: string }>(`templates/${encodeURIComponent(templateUuid)}/copy?org_id=${orgId}`, accessToken, 'POST'),
  authorizations: (orgId: number, perspective: 'creator' | 'issuer', accessToken?: string, status?: string) =>
    marketplaceRequest<TemplateAuthorization[]>(`template-authorizations?${qs({ org_id: orgId, perspective, status })}`, accessToken),
  request: (data: { template_uuid: string; issuer_org_id: number; message?: string }, accessToken?: string) => marketplaceRequest<TemplateAuthorization>('template-authorizations', accessToken, 'POST', data),
  approve: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/approve`, accessToken, 'POST'),
  reject: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/reject`, accessToken, 'POST'),
  revoke: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/revoke`, accessToken, 'POST'),
}
