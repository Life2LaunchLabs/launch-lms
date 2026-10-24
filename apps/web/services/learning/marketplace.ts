import { getAPIUrl } from '@services/config/config'
import type { GoalIcon } from '@services/goals/types'
import type { BadgeSummary } from '@services/badges/badges'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

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
  /** The badge this plan earns: running it is permission to award the badge. */
  badge?: BadgeSummary | null
  /** Creator side only: plans the issuer runs on it (counts only). */
  learner_count?: number
}

export interface MarketplaceTemplate extends TemplateListing {
  template_uuid: string
  title: string
  description: string
  thumbnail_image: string | null
  icon?: GoalIcon | null
  color?: string | null
  published_version: number | null
  stage_count: number
  step_count: number
  creator_org: MarketplaceOrg | null
  is_own: boolean
  badge: BadgeSummary | null
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
  const result = await fetch(`${getAPIUrl()}plan-marketplace/${path}`, RequestBodyWithAuthHeader(method, body, null, accessToken))
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
  /** Ask to run a listed plan (and award its badge, when it earns one). */
  request: (data: { template_uuid: string; issuer_org_id: number; message?: string }, accessToken?: string) => marketplaceRequest<TemplateAuthorization>('template-authorizations', accessToken, 'POST', data),
  approve: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/approve`, accessToken, 'POST'),
  reject: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/reject`, accessToken, 'POST'),
  /** Either side ends it: the owner revokes, or the organization leaves the plan (and stops awarding its badge). */
  revoke: (authorizationUuid: string, accessToken?: string) => marketplaceRequest<TemplateAuthorization>(`template-authorizations/${encodeURIComponent(authorizationUuid)}/revoke`, accessToken, 'POST'),
}
