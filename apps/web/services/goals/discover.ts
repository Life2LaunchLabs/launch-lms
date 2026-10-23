import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { MarketplaceTemplate } from '@services/learning/marketplace'
import type { TemplateListItem } from './templates'
import type { TemplateDocument } from './types'

const q = encodeURIComponent
const discoverUrl = (path = '') => `${getAPIUrl()}discover${path}`
const withOrg = (url: string, orgId: number) => `${url}${url.includes('?') ? '&' : '?'}org_id=${orgId}`

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** Where this organization stands with something in Discover (apps/api/src/services/goals/discover.py). */
export type DiscoverStatus = 'own' | 'added' | 'requested' | 'none'

export interface DiscoverPlan extends MarketplaceTemplate {
  categories: string[]
  partner: boolean
  status: DiscoverStatus
  /** The plan as it is here once added: your copy of an editable plan, or the creator's locked plan. */
  local_template_uuid: string | null
}

export interface DiscoverCollection {
  collection_uuid: string
  name: string
  description: string
  categories: string[]
  creator_org: MarketplaceTemplate['creator_org']
  partner: boolean
  plan_count: number
  template_uuids: string[]
  thumbs: Array<{ template_uuid: string; title: string; thumbnail_image: string | null }>
  badge_count: number
  locked: boolean
  access: 'open' | 'request'
  status: DiscoverStatus
  local_collection_uuid: string | null
}

export interface DiscoverPage { featured: DiscoverCollection | null; collections: DiscoverCollection[]; plans: DiscoverPlan[]; categories: string[] }
export interface DiscoverPlanDetail extends DiscoverPlan { document: TemplateDocument; live_version: { semver: string | null; number: number } | null; collections: DiscoverCollection[] }
export interface DiscoverCollectionDetail extends DiscoverCollection { plans: DiscoverPlan[] }

/** Another organization's plan shown in Plans: run as-is, or asked for and waiting. */
export interface AddedPlan {
  template_uuid: string
  title: string
  description: string
  thumbnail_image: string
  org_id: number
  owner_org: MarketplaceTemplate['creator_org']
  step_count: number
  badges: MarketplaceTemplate['badges']
  live_version: { semver: string | null; number: number } | null
  published_version: number | null
  requested: boolean
  read_only: true
  collections: Array<{ collection_uuid: string; name: string }>
}

/** Added plans in the shape of the Plans list (read-only; requested ones flagged). */
export function addedAsListItems(added: AddedPlan[]): TemplateListItem[] {
  return added.map((plan) => ({
    template_uuid: plan.template_uuid, title: plan.title, description: plan.description, thumbnail_image: plan.thumbnail_image, org_id: plan.org_id,
    status: 'active', system_type: null, etag: '', has_unpublished_changes: false, update_date: '', read_only: true, requested: plan.requested,
    step_count: plan.step_count, badges: plan.badges as any, collections: plan.collections, published_version: plan.published_version,
    live_version: plan.live_version as any,
  } as unknown as TemplateListItem))
}

/** Any SWR key under /discover, for revalidating after a change. */
export const isDiscoverKey = (key: unknown) => typeof key === 'string' && key.startsWith(discoverUrl())

export const discoverKeys = {
  page: (orgId: number, query = '') => withOrg(discoverUrl(query ? `?q=${q(query)}` : ''), orgId),
  added: (orgId: number) => withOrg(discoverUrl('/added'), orgId),
  plan: (orgId: number, uuid: string) => withOrg(discoverUrl(`/plans/${q(uuid)}`), orgId),
  collection: (orgId: number, uuid: string) => withOrg(discoverUrl(`/collections/${q(uuid)}`), orgId),
}

export const discoverApi = {
  page: (orgId: number, query = '', token?: string) => request<DiscoverPage>(discoverKeys.page(orgId, query), token),
  added: (orgId: number, token?: string) => request<AddedPlan[]>(discoverKeys.added(orgId), token),
  plan: (orgId: number, uuid: string, token?: string) => request<DiscoverPlanDetail>(discoverKeys.plan(orgId, uuid), token),
  collection: (orgId: number, uuid: string, token?: string) => request<DiscoverCollectionDetail>(discoverKeys.collection(orgId, uuid), token),
  addPlan: (orgId: number, uuid: string, token?: string) => request<DiscoverPlanDetail>(withOrg(discoverUrl(`/plans/${q(uuid)}/add`), orgId), token, 'POST'),
  cancelRequest: (orgId: number, uuid: string, token?: string) => request<DiscoverPlanDetail>(withOrg(discoverUrl(`/plans/${q(uuid)}/request`), orgId), token, 'DELETE'),
  addCollection: (orgId: number, uuid: string, token?: string) => request<DiscoverCollectionDetail>(withOrg(discoverUrl(`/collections/${q(uuid)}/add`), orgId), token, 'POST'),
}
