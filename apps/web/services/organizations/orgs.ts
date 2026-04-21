import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

/*
 This file includes only POST, PUT, DELETE requests
 GET requests are called from the frontend using SWR (https://swr.vercel.app/)
*/

export async function createNewOrganization(body: any, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}orgs`,
    RequestBodyWithAuthHeader('POST', body, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function deleteOrganizationFromBackend(
  org_id: any,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function getOrganizationContextInfo(
  org_slug: any,
  next: any,
  access_token?: string
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/slug/${org_slug}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function getOrganizationContextInfoWithUUID(
  org_uuid: string,
  next: any,
  access_token?: string
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/uuid/${org_uuid}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function getOrganizationContextInfoWithoutCredentials(
  org_slug: any,
  next: any
) {
  let HeadersConfig = new Headers({ 'Content-Type': 'application/json' })
  let options: any = {
    method: 'GET',
    headers: HeadersConfig,
    redirect: 'follow',
    // Next.js
    next: next,
  }

  const result = await fetch(`${getAPIUrl()}orgs/slug/${org_slug}`, options)
  const res = await errorHandling(result)
  return res
}

export function getOrganizationContextInfoNoAsync(
  org_slug: any,
  next: any,
  access_token: string
) {
  const result = fetch(
    `${getAPIUrl()}orgs/slug/${org_slug}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  return result
}

export async function updateUserRole(
  org_id: any,
  user_id: any,
  role_uuid: any,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/users/${user_id}/role/${role_uuid}`,
    RequestBodyWithAuthHeader('PUT', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function updateOrgLanding(
  org_id: any,
  landing_object: any,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/landing`,
    RequestBodyWithAuthHeader('PUT', landing_object, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function uploadLandingContent(
  org_uuid: any,
  content_file: File,
  access_token: string
) {
  const formData = new FormData()
  formData.append('content_file', content_file)
  
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_uuid}/landing/content`,
    RequestBodyFormWithAuthHeader('POST', formData, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function removeUserFromOrg(
  org_id: any,
  user_id: any,
  access_token: any
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/users/${user_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function removeUsersFromOrg(
  org_id: any,
  user_ids: number[],
  access_token: string
) {
  const params = new URLSearchParams()
  user_ids.forEach((id) => params.append('user_ids', id.toString()))
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/users/batch/remove?${params.toString()}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function joinOrg(
  args: {
    org_id: number
    user_id: string
    invite_code?: string
  },
  next: any,
  access_token?: string
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/join`,
    RequestBodyWithAuthHeader('POST', args, next, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export interface DiscoverOrganization {
  id: number
  org_uuid: string
  name: string
  description?: string | null
  about?: string | null
  socials?: Record<string, any> | null
  links?: Record<string, any> | null
  scripts?: Record<string, any> | null
  logo_image?: string | null
  thumbnail_image?: string | null
  previews?: Record<string, any> | null
  explore?: boolean | null
  label?: string | null
  slug: string
  email: string
  config?: any
  creation_date: string
  update_date: string
  signup_mode: 'open' | 'inviteOnly' | string
  is_member: boolean
  member_count: number
}

export async function getDiscoverOrganizations(
  args: { page?: number; limit?: number; query?: string },
  next?: any,
  access_token?: string
) {
  const params = new URLSearchParams()
  params.set('page', String(args.page ?? 1))
  params.set('limit', String(args.limit ?? 24))
  if (args.query?.trim()) {
    params.set('query', args.query.trim())
  }

  const result = await fetch(
    `${getAPIUrl()}orgs/discover?${params.toString()}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res as DiscoverOrganization[]
}

export async function getDiscoverOrganizationBySlug(
  org_slug: string,
  next?: any,
  access_token?: string
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/discover/${org_slug}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res as DiscoverOrganization
}

export async function leaveOrg(org_id: number, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/leave`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}
