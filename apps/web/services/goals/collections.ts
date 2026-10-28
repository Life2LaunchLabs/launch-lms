import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PlanCover } from './types'

const q = encodeURIComponent
const collectionsUrl = (path = '') => `${getAPIUrl()}plan-collections${path}`
const withOrg = (url: string, orgId: number) => `${url}${url.includes('?') ? '&' : '?'}org_id=${orgId}`

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** A plan collection: a grouping of the organization's plans (apps/api/src/services/goals/collections.py). */
export interface PlanCollection {
  collection_uuid: string
  name: string
  description: string
  categories: string[]
  plan_count: number
  template_uuids: string[]
  thumbs: Array<PlanCover & { template_uuid: string; title: string }>
  /** Plans in it shared with other organizations (listed, with a live version). */
  published_count: number
  last_opened_at: string | null
  update_date: string
  /** The platform's own collection used as a starter category in New plan. */
  starter?: boolean
}

export interface PlanCollectionList { collections: PlanCollection[]; categories: string[] }

/** Any SWR key under /plan-collections, for revalidating after a change. */
export const isCollectionsKey = (key: unknown) => typeof key === 'string' && key.startsWith(collectionsUrl())

export const collectionKeys = {
  list: (orgId: number) => withOrg(collectionsUrl(), orgId),
  one: (orgId: number, uuid: string) => withOrg(collectionsUrl(`/${q(uuid)}`), orgId),
}

export const collectionsApi = {
  list: (orgId: number, token?: string) => request<PlanCollectionList>(collectionKeys.list(orgId), token),
  get: (orgId: number, uuid: string, token?: string) => request<PlanCollection>(collectionKeys.one(orgId, uuid), token),
  create: (orgId: number, data: { name: string; description?: string; categories?: string[]; template_uuids?: string[] }, token?: string) => request<PlanCollection>(collectionKeys.list(orgId), token, 'POST', data),
  update: (orgId: number, uuid: string, data: { name?: string; description?: string; categories?: string[]; starter?: boolean }, token?: string) => request<PlanCollection>(collectionKeys.one(orgId, uuid), token, 'PATCH', data),
  remove: (orgId: number, uuid: string, token?: string) => request(collectionKeys.one(orgId, uuid), token, 'DELETE'),
  addPlans: (orgId: number, uuid: string, templateUuids: string[], token?: string) => request<PlanCollection>(withOrg(collectionsUrl(`/${q(uuid)}/plans`), orgId), token, 'POST', { template_uuids: templateUuids }),
  removePlan: (orgId: number, uuid: string, templateUuid: string, token?: string) => request<PlanCollection>(withOrg(collectionsUrl(`/${q(uuid)}/plans/${q(templateUuid)}`), orgId), token, 'DELETE'),
  opened: (orgId: number, uuid: string, token?: string) => request(withOrg(collectionsUrl(`/${q(uuid)}/opened`), orgId), token, 'POST'),
}
