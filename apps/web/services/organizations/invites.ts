import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  getResponseMetadata,
} from '@services/utils/ts/requests'

export async function inviteBatchUsers(
  org_id: any,
  body: {
    emails: string[]
    role_id: number
    usergroup_id?: number
    new_usergroup_name?: string
    source?: 'manual' | 'csv' | 'api'
    batch_uuid?: string
  },
  access_token: any
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/invites/users/batch`,
    RequestBodyWithAuthHeader('POST', body, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function previewBatchUsers(org_id: number, body: Parameters<typeof inviteBatchUsers>[1], access_token: string) {
  const result = await fetch(`${getAPIUrl()}orgs/${org_id}/invites/users/preview`, RequestBodyWithAuthHeader('POST', body, null, access_token))
  return getResponseMetadata(result)
}

export async function resendUserInvitation(org_id: number, invitation_uuid: string, access_token: string) {
  const result = await fetch(`${getAPIUrl()}orgs/${org_id}/invites/users/${encodeURIComponent(invitation_uuid)}/resend`, RequestBodyWithAuthHeader('POST', {}, null, access_token))
  return getResponseMetadata(result)
}

export async function createJoinLink(org_id: number, body: { display_name: string; usergroup_id?: number; expires_in_minutes: number; max_redemptions: number; approved_email_domain?: string }, access_token: string) {
  const result = await fetch(`${getAPIUrl()}orgs/${org_id}/join-links`, RequestBodyWithAuthHeader('POST', body, null, access_token))
  return getResponseMetadata(result)
}

export async function revokeJoinLink(org_id: number, link_uuid: string, access_token: string) {
  const result = await fetch(`${getAPIUrl()}orgs/${org_id}/join-links/${encodeURIComponent(link_uuid)}`, RequestBodyWithAuthHeader('DELETE', null, null, access_token))
  return getResponseMetadata(result)
}

export async function revokeUserInvitation(
  org_id: number,
  invitation_uuid: string,
  access_token: string
) {
  const result = await fetch(
    `${getAPIUrl()}orgs/${org_id}/invites/users/${encodeURIComponent(invitation_uuid)}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  return getResponseMetadata(result)
}
