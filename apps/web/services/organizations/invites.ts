import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  getResponseMetadata,
} from '@services/utils/ts/requests'

export async function createInviteCode(
  org_id: any,
  access_token: any,
  options?: { usergroupId?: number; displayName?: string; expiryDate?: string }
) {
  const params = new URLSearchParams()
  if (options?.usergroupId) params.set('usergroup_id', String(options.usergroupId))
  if (options?.displayName?.trim()) params.set('display_name', options.displayName.trim())
  if (options?.expiryDate) params.set('expiry_date', options.expiryDate)
  const query = params.toString()
  const url = `${getAPIUrl()}orgs/${org_id}/invites${query ? `?${query}` : ''}`
  const result = await fetch(
    url,
    RequestBodyWithAuthHeader('POST', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function deleteInviteCode(
  org_id: any,
  org_invite_code_uuid: string,
  access_token: any
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/invites/${org_invite_code_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function changeSignupMechanism(
  org_id: any,
  signup_mechanism: string,
  access_token: any
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/signup_mechanism?signup_mechanism=${signup_mechanism}`,
    RequestBodyWithAuthHeader('PUT', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function validateInviteCode(
  org_id: any,
  invite_code: string,
  access_token: any
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/invites/code/${invite_code}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function inviteBatchUsers(
  org_id: any,
  emails: string,
  invite_code_uuid: string,
  access_token: any
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/invites/users/batch?emails=${emails}&invite_code_uuid=${invite_code_uuid}`,
    RequestBodyWithAuthHeader('POST', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}
