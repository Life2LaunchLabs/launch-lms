import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  getResponseMetadata,
} from '@services/utils/ts/requests'

/*
  Platform (superadmin) service matching /api/v1/superadmin endpoints.
  Note: GET requests are usually fetched with SWR directly from components.
*/

export type GlobalUserCreateBody = {
  username: string
  email: string
  password: string
  first_name?: string
  last_name?: string
  org_id?: number | null
  role_id?: number | null
}

export type GlobalUserUpdateBody = {
  username?: string
  email?: string
  first_name?: string
  last_name?: string
  bio?: string
  email_verified?: boolean
  is_superadmin?: boolean
}

export type BatchUserActionBody = {
  user_ids: number[]
  action: 'add_to_org' | 'remove_from_org' | 'verify_email' | 'delete'
  org_id?: number | null
  role_id?: number | null
}

export type OrgSettingsBody = {
  name?: string
  slug?: string
  email?: string
  description?: string
}

// ============================================================================
// Users
// ============================================================================

export async function createPlatformUser(
  body: GlobalUserCreateBody,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users`,
    RequestBodyWithAuthHeader('POST', body, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function updatePlatformUser(
  user_id: number,
  body: GlobalUserUpdateBody,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users/${user_id}`,
    RequestBodyWithAuthHeader('PATCH', body, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function deletePlatformUser(user_id: number, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users/${user_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function generatePasswordResetLink(
  user_id: number,
  org_id: number | null,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users/${user_id}/password-reset-link`,
    RequestBodyWithAuthHeader('POST', { org_id }, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function setPlatformUserPassword(
  user_id: number,
  new_password: string,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users/${user_id}/password`,
    RequestBodyWithAuthHeader('POST', { new_password }, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function unlockPlatformUser(user_id: number, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users/${user_id}/unlock`,
    RequestBodyWithAuthHeader('POST', null, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function setPlatformUserMembership(
  user_id: number,
  org_id: number,
  role_id: number,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users/${user_id}/orgs/${org_id}`,
    RequestBodyWithAuthHeader('PUT', { role_id }, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function removePlatformUserMembership(
  user_id: number,
  org_id: number,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users/${user_id}/orgs/${org_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function batchPlatformUserAction(
  body: BatchUserActionBody,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/users/batch`,
    RequestBodyWithAuthHeader('POST', body, null, access_token)
  )
  return getResponseMetadata(result)
}

// ============================================================================
// Organizations
// ============================================================================

export async function createPlatformOrg(
  body: { name: string; slug: string; email: string; description?: string },
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/organizations`,
    RequestBodyWithAuthHeader('POST', body, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function deletePlatformOrg(org_id: number, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/organizations/${org_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function updatePlatformOrgSettings(
  org_id: number,
  body: OrgSettingsBody,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/organizations/${org_id}/settings`,
    RequestBodyWithAuthHeader('PUT', body, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function updatePlatformOrgPlan(
  org_id: number,
  plan: string,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/organizations/${org_id}/plan`,
    RequestBodyWithAuthHeader('PUT', { plan }, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function updatePlatformOrgPackages(
  org_id: number,
  packages: string[],
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/organizations/${org_id}/packages`,
    RequestBodyWithAuthHeader('PUT', { packages }, null, access_token)
  )
  return getResponseMetadata(result)
}

export async function updatePlatformOrgConfig(
  org_id: number,
  config: Record<string, any>,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/organizations/${org_id}/config`,
    RequestBodyWithAuthHeader('PUT', { config }, null, access_token)
  )
  return getResponseMetadata(result)
}

// ============================================================================
// Plan requests
// ============================================================================

export async function updatePlanRequest(
  request_uuid: string,
  status: 'approved' | 'denied',
  message: string | null,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}superadmin/plan-requests/${request_uuid}`,
    RequestBodyWithAuthHeader('PUT', { status, message }, null, access_token)
  )
  return getResponseMetadata(result)
}
