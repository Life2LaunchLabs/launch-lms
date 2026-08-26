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
