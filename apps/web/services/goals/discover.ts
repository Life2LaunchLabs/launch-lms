import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { MarketplaceTemplate } from '@services/learning/marketplace'
import type { TemplateListItem } from './templates'
import type { GoalIcon, PlanCover, TemplateDocument } from './types'

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
  /** With a `covers` filter: the requirements asked about that this plan's steps count toward. */
  covers?: string[]
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
  thumbs: Array<{ template_uuid: string; title: string; thumbnail_image: string | null; icon?: GoalIcon | null; color?: string | null }>
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
export interface AddedPlan extends PlanCover {
  template_uuid: string
  title: string
  description: string
  org_id: number
  owner_org: MarketplaceTemplate['creator_org']
  step_count: number
  badge: MarketplaceTemplate['badge']
  live_version: { semver: string | null; number: number } | null
  published_version: number | null
  requested: boolean
  read_only: true
  collections: Array<{ collection_uuid: string; name: string }>
}

/** Added plans in the shape of the Plans list (read-only; requested ones flagged). */
export function addedAsListItems(added: AddedPlan[]): TemplateListItem[] {
  return added.map((plan) => ({
    template_uuid: plan.template_uuid, title: plan.title, description: plan.description, thumbnail_image: plan.thumbnail_image, icon: plan.icon, color: plan.color, org_id: plan.org_id,
    status: 'active', system_type: null, etag: '', has_unpublished_changes: false, update_date: '', read_only: true, requested: plan.requested,
    step_count: plan.step_count, badge: plan.badge, collections: plan.collections, published_version: plan.published_version,
    live_version: plan.live_version as any,
  } as unknown as TemplateListItem))
}

/** Any SWR key under /discover, for revalidating after a change. */
export const isDiscoverKey = (key: unknown) => typeof key === 'string' && key.startsWith(discoverUrl())

export const discoverKeys = {
  /** `covers` narrows to plans whose steps count toward any of these requirements, most covered first. */
  page: (orgId: number, query = '', covers: string[] = []) => {
    const params = [query ? `q=${q(query)}` : '', ...covers.map((uuid) => `covers=${q(uuid)}`)].filter(Boolean).join('&')
    return withOrg(discoverUrl(params ? `?${params}` : ''), orgId)
  },
  added: (orgId: number) => withOrg(discoverUrl('/added'), orgId),
  plan: (orgId: number, uuid: string) => withOrg(discoverUrl(`/plans/${q(uuid)}`), orgId),
  collection: (orgId: number, uuid: string) => withOrg(discoverUrl(`/collections/${q(uuid)}`), orgId),
}

export const discoverApi = {
  page: (orgId: number, query = '', token?: string, covers: string[] = []) => request<DiscoverPage>(discoverKeys.page(orgId, query, covers), token),
  added: (orgId: number, token?: string) => request<AddedPlan[]>(discoverKeys.added(orgId), token),
  plan: (orgId: number, uuid: string, token?: string) => request<DiscoverPlanDetail>(discoverKeys.plan(orgId, uuid), token),
  collection: (orgId: number, uuid: string, token?: string) => request<DiscoverCollectionDetail>(discoverKeys.collection(orgId, uuid), token),
  addPlan: (orgId: number, uuid: string, token?: string) => request<DiscoverPlanDetail>(withOrg(discoverUrl(`/plans/${q(uuid)}/add`), orgId), token, 'POST'),
  cancelRequest: (orgId: number, uuid: string, token?: string) => request<DiscoverPlanDetail>(withOrg(discoverUrl(`/plans/${q(uuid)}/request`), orgId), token, 'DELETE'),
  addCollection: (orgId: number, uuid: string, token?: string) => request<DiscoverCollectionDetail>(withOrg(discoverUrl(`/collections/${q(uuid)}/add`), orgId), token, 'POST'),
}
