import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

export type ResourceType =
  | 'assessment'
  | 'video'
  | 'article'
  | 'tool'
  | 'guide'
  | 'course'
  | 'other'

export interface ResourceChannel {
  id: number
  org_id: number
  channel_uuid: string
  name: string
  description: string | null
  thumbnail_image: string | null
  public: boolean
  is_starred: boolean
  color: string | null
  creation_date: string
  update_date: string
  resource_count: number
  is_accessible: boolean
  usergroup_ids: number[]
}

export interface UserResourceChannel {
  id: number
  user_id: number
  org_id: number
  user_channel_uuid: string
  name: string
  description: string | null
  is_default: boolean
  creation_date: string
  update_date: string
  resource_count: number
}

export interface SavedResourceState {
  id: number
  user_id: number
  resource_id: number
  notes: string | null
  outcome_text: string | null
  outcome_link: string | null
  outcome_file: string | null
  last_opened_at: string | null
  completed_at: string | null
  open_count: number
  creation_date: string
  update_date: string
}

export interface Resource {
  id: number
  org_id: number
  resource_uuid: string
  created_by_user_id: number | null
  title: string
  description: string | null
  resource_type: ResourceType
  provider_name: string | null
  provider_url: string | null
  external_url: string
  cover_image_url: string | null
  thumbnail_image: string | null
  estimated_time: number | null
  is_featured: boolean
  is_live: boolean
  access_mode: 'free' | 'paid' | 'restricted'
  creation_date: string
  update_date: string
  save_count: number
  comment_count: number
  is_saved: boolean
  has_outcome: boolean
  channels: ResourceChannel[]
  user_state: SavedResourceState | null
}

export interface ResourceComment {
  id: number
  resource_id: number
  author_id: number
  comment_uuid: string
  content: string
  is_locked: boolean
  creation_date: string
  update_date: string
  author?: {
    id: number
    user_uuid: string
    username: string
    first_name: string
    last_name: string
    avatar_image: string | null
  } | null
}

export async function getResourceChannels(orgId: number, accessToken?: string, includePrivate = false) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/org/${orgId}/channels?include_private=${includePrivate}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<{ channels: ResourceChannel[]; user_channels: UserResourceChannel[] }>
}

export async function getResources(
  orgId: number,
  params: Record<string, string | boolean | undefined>,
  accessToken?: string
) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value))
  })
  const result: any = await fetch(
    `${getAPIUrl()}resources/org/${orgId}?${search.toString()}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<Resource[]>
}

export async function getResource(resourceUuid: string, accessToken?: string, includePrivate = false) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}?include_private=${includePrivate}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<Resource>
}

export async function createResource(orgId: number, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/?org_id=${orgId}`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function updateResource(resourceUuid: string, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function deleteResource(resourceUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function uploadResourceThumbnail(resourceUuid: string, formData: FormData, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}/thumbnail`,
    RequestBodyFormWithAuthHeader('PUT', formData, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function createResourceChannel(orgId: number, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/channels?org_id=${orgId}`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function updateResourceChannel(channelUuid: string, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/channels/${channelUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function deleteResourceChannel(channelUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/channels/${channelUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function uploadResourceChannelThumbnail(channelUuid: string, formData: FormData, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/channels/${channelUuid}/thumbnail`,
    RequestBodyFormWithAuthHeader('PUT', formData, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function getChannelResources(channelUuid: string, accessToken?: string, includePrivate = false) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/channels/${channelUuid}/resources?include_private=${includePrivate}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<Resource[]>
}

export async function addResourceToChannel(channelUuid: string, resourceUuid: string, accessToken: string, sortOrder = 0) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/channels/${channelUuid}/resources`,
    RequestBodyWithAuthHeader('POST', { resource_uuid: resourceUuid, sort_order: sortOrder }, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function removeResourceFromChannel(channelUuid: string, resourceUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/channels/${channelUuid}/resources/${resourceUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function createUserResourceChannel(orgId: number, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/org/${orgId}/me/channels`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function saveResource(resourceUuid: string, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}/save`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function unsaveResource(resourceUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}/save`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function uploadOutcomeFile(resourceUuid: string, formData: FormData, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}/save/outcome-file`,
    RequestBodyFormWithAuthHeader('PUT', formData, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function getResourceComments(resourceUuid: string, accessToken?: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}/comments`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<ResourceComment[]>
}

export async function createResourceComment(resourceUuid: string, data: { content: string }, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/${resourceUuid}/comments`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<ResourceComment>
}

export async function updateResourceComment(commentUuid: string, data: { content: string }, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/comments/${commentUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<ResourceComment>
}

export async function deleteResourceComment(commentUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/comments/${commentUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return getResponseMetadata(result)
}

export async function importResourcesCsv(orgId: number, formData: FormData, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}resources/org/${orgId}/import`,
    RequestBodyFormWithAuthHeader('POST', formData, null, accessToken)
  )
  return getResponseMetadata(result)
}
