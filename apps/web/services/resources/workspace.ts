import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PlanCover } from '@services/goals/types'
import type { ResourceTag, ResourceType } from './resources'

// Staff's view of their resources and the Library (apps/api/src/services/resource_library.py).

const q = encodeURIComponent
const url = (path: string) => `${getAPIUrl()}resources${path}`

async function request<T = any>(target: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(target, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type ChannelAudience = 'org' | 'groups' | 'staff'

type Owner = {
  owner_org_id: number
  owner_org_uuid: string
  owner_org_slug: string
  owner_org_name: string
  /** Owned by another organization (a Library channel or resource this org saved). */
  is_shared_from_other_org: boolean
}

export type ChannelCard = Owner & {
  id: number
  org_id: number
  channel_uuid: string
  name: string
  description: string | null
  thumbnail_image: string | null
  color: string | null
  audience: ChannelAudience
  comment_rule: 'all' | 'staff' | 'off'
  hold_links: boolean
  listed: boolean
  listed_at: string | null
  resource_count: number
  /** Up to four resource types inside, in channel order. */
  resource_types: ResourceType[]
  usergroup_ids: number[]
  saved: boolean
  save_count: number
  /** Held or reported comments waiting on this org's staff (its own channels only). */
  needs_look: number
}

export type ResourceRow = Owner & {
  id: number
  org_id: number
  resource_uuid: string
  title: string
  description: string | null
  resource_type: ResourceType
  provider_name: string | null
  external_url: string
  cover_image_url: string | null
  thumbnail_image: string | null
  estimated_time: number | null
  creation_date: string
  tags: ResourceTag[]
  channels: Array<{ channel_uuid: string; name: string; color: string | null; org_id: number }>
  in_library: boolean
  /** Saved by this org, on its own or through a saved channel. */
  saved: boolean
  saved_directly: boolean
  comment_count: number
  average_rating: number | null
  rating_count: number
  needs_look: number
}

export type Workspace = { channels: ChannelCard[]; resources: ResourceRow[]; can_list: boolean }
export type LibraryResults = { channels: ChannelCard[]; resources: ResourceRow[] }
export type ChannelDetail = ChannelCard & { can_edit: boolean; can_list: boolean; resources: ResourceRow[] }
export type ResourceDetail = ResourceRow & {
  can_edit: boolean
  added_by: { first_name?: string; last_name?: string; username?: string } | null
  used_in: Array<Omit<PlanCover, 'thumbnail_image'> & { template_uuid: string; title: string; thumbnail_image: string | null; steps: string[] }>
  /** The most open rule among its channels, and whether any of them holds comments with links. */
  comment_rule: ChannelCard['comment_rule']
  hold_links: boolean
}

/** Any SWR key under /resources, for revalidating after a change. */
export const isResourcesKey = (key: unknown) => typeof key === 'string' && key.startsWith(url(''))

export const resourceKeys = {
  workspace: (orgId: number) => url(`/org/${orgId}/workspace`),
  library: (orgId: number, query = '', type = '') => url(`/org/${orgId}/library?query=${q(query)}&resource_type=${q(type)}`),
  channel: (orgId: number, uuid: string) => url(`/org/${orgId}/channels/${q(uuid)}`),
  resource: (orgId: number, uuid: string) => url(`/org/${orgId}/resources/${q(uuid)}`),
}

export const resourcesApi = {
  workspace: (orgId: number, token?: string) => request<Workspace>(resourceKeys.workspace(orgId), token),
  library: (orgId: number, query: string, type: string, token?: string) => request<LibraryResults>(resourceKeys.library(orgId, query, type), token),
  channel: (orgId: number, uuid: string, token?: string) => request<ChannelDetail>(resourceKeys.channel(orgId, uuid), token),
  resource: (orgId: number, uuid: string, token?: string) => request<ResourceDetail>(resourceKeys.resource(orgId, uuid), token),
  saveChannel: (orgId: number, uuid: string, saved: boolean, token?: string) => request(url(`/org/${orgId}/saved/channels/${q(uuid)}`), token, saved ? 'POST' : 'DELETE'),
  saveResource: (orgId: number, uuid: string, saved: boolean, token?: string) => request(url(`/org/${orgId}/saved/resources/${q(uuid)}`), token, saved ? 'POST' : 'DELETE'),
  createChannel: (orgId: number, data: { name: string; description?: string | null; audience?: ChannelAudience }, token?: string) =>
    request<{ channel_uuid: string }>(url(`/channels?org_id=${orgId}`), token, 'POST', data),
  updateChannel: (uuid: string, data: Partial<Pick<ChannelCard, 'name' | 'description' | 'thumbnail_image' | 'color' | 'audience' | 'comment_rule' | 'hold_links' | 'listed'>>, token?: string) =>
    request(url(`/channels/${q(uuid)}`), token, 'PUT', data),
  deleteChannel: (uuid: string, token?: string) => request(url(`/channels/${q(uuid)}`), token, 'DELETE'),
  reorder: (uuid: string, resourceUuids: string[], token?: string) => request(url(`/channels/${q(uuid)}/order`), token, 'PUT', { resource_uuids: resourceUuids }),
  link: (channelUuid: string, resourceUuid: string, token?: string) => request(url(`/channels/${q(channelUuid)}/resources`), token, 'POST', { resource_uuid: resourceUuid }),
  unlink: (channelUuid: string, resourceUuid: string, token?: string) => request(url(`/channels/${q(channelUuid)}/resources/${q(resourceUuid)}`), token, 'DELETE'),
  createResource: (orgId: number, data: ResourceInput, token?: string) => request<{ resource_uuid: string }>(url(`/?org_id=${orgId}`), token, 'POST', data),
  updateResource: (uuid: string, data: Partial<ResourceInput>, token?: string) => request(url(`/${q(uuid)}`), token, 'PUT', data),
  deleteResource: (uuid: string, token?: string) => request(url(`/${q(uuid)}`), token, 'DELETE'),
}

export type ResourceInput = {
  title: string
  external_url: string
  resource_type: ResourceType
  description?: string | null
  provider_name?: string | null
  cover_image_url?: string | null
  estimated_time?: number | null
}

export const AUDIENCE_LABELS: Record<ChannelAudience, string> = { org: 'Everyone', groups: 'Chosen groups', staff: 'Staff only' }

export const RESOURCE_TYPES: Array<{ value: ResourceType; label: string; plural: string }> = [
  { value: 'article', label: 'Article', plural: 'Articles' },
  { value: 'video', label: 'Video', plural: 'Videos' },
  { value: 'tool', label: 'Tool', plural: 'Tools' },
  { value: 'guide', label: 'Guide', plural: 'Guides' },
  { value: 'course', label: 'Course', plural: 'Courses' },
  { value: 'assessment', label: 'Assessment', plural: 'Assessments' },
  { value: 'other', label: 'Other', plural: 'Other' },
]

export const typeLabel = (type: ResourceType) => RESOURCE_TYPES.find((item) => item.value === type)?.label || 'Other'
