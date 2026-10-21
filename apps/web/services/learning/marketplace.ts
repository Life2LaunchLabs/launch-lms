import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

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
  data: { default_issuer_org_id?: number; clear_default_issuer?: boolean },
  accessToken?: string
) {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/badges/${badgeUuid}/issuing`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result)
}

/** Other organizations' badges this one issues, each with the plans it runs for it (leave a plan to stop). */
export async function getIssuedBadges(orgId: string | number, accessToken?: string): Promise<IssuedBadge[]> {
  const result = await fetch(
    `${getAPIUrl()}badge-marketplace/issuing?org_id=${orgId}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
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

// Plan templates in the marketplace (permission is to use a plan, and to issue the badges it earns) ------------

export type TemplateListingMode = 'locked' | 'open'
export type TemplateListingAccess = 'open' | 'request'
export type TemplateAuthorizationStatus = 'requested' | 'approved' | 'rejected' | 'revoked'

export interface PlanBadge { badge_uuid: string; name: string; thumbnail_image: string; route_uuid: string }

/** One of a marketplace badge's plans, with this organization's permission on it (asking for it is asking to issue the badge). */
export interface BadgePlanOption { route_uuid: string; template_uuid: string; title: string; recommended: boolean; authorization: TemplateAuthorization | null }

/** A plan an organization runs for a badge: who may start it there, and its permission (none for the owner). */
export interface RunPlan { route_uuid: string; template_uuid: string; title: string; access: LearnerAccess; authorization_uuid: string | null }

export interface IssuedBadge {
  badge: { badge_uuid: string; name: string; thumbnail_image?: string | null }
  creator_org: MarketplaceOrg | null
  learner_access: LearnerAccess
  plans: RunPlan[]
}

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
  /** The badges this plan earns: approval on it is permission to issue them. */
  badges?: PlanBadge[]
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
  badges: PlanBadge[]
  frameworks: { framework_uuid: string; name: string; node_count: number }[]
  requirement_count: number
  authorization: TemplateAuthorization | null
}

/** Quick usage counts on a template's Publish tab, across every organization running it. */
export interface TemplateUsageMetrics {
  authorized_orgs: number
  pending_requests: number
  orgs_running: number
  assignments: number
  active_learners: number
  completions: number
  badges_earned: number
}

export interface MarketplaceRequestsSummary {
  incoming_requested: number
  outgoing_pending: number
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
  authorizations: (orgId: number, perspective: 'creator' | 'issuer', accessToken?: string, status?: string, templateUuid?: string) =>
    marketplaceRequest<TemplateAuthorization[]>(`template-authorizations?${qs({ org_id: orgId, perspective, status, template_uuid: templateUuid })}`, accessToken),
  /** The template's owner authorizes another organization by slug (approving its request if it asked). */
  invite: (orgId: number, templateUuid: string, issuerOrgSlug: string, accessToken?: string) =>
    marketplaceRequest<TemplateAuthorization>(`templates/${encodeURIComponent(templateUuid)}/authorizations/invite?org_id=${orgId}`, accessToken, 'POST', { issuer_org_slug: issuerOrgSlug }),
  metrics: (orgId: number, templateUuid: string, accessToken?: string) => marketplaceRequest<TemplateUsageMetrics>(`templates/${encodeURIComponent(templateUuid)}/metrics?org_id=${orgId}`, accessToken),
  /** Ask to use a listed template, or to issue a marketplace badge through one of its plans. */
  request: (data: { template_uuid: string; issuer_org_id: number; message?: string }, accessToken?: string) => marketplaceRequest<TemplateAuthorization>('template-authorizations', accessToken, 'POST', data),
  approve: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/approve`, accessToken, 'POST'),
  reject: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/reject`, accessToken, 'POST'),
  /** Either side ends it: the owner revokes, or the organization leaves the plan (and stops issuing its badges). */
  revoke: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/revoke`, accessToken, 'POST'),
}
