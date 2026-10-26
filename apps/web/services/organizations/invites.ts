import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  getResponseMetadata,
} from '@services/utils/ts/requests'

export type AssignmentRoleKey = 'lead' | 'review' | 'comment'
export interface InviteAssignment { assignment_uuid: string; role_key: AssignmentRoleKey }

export async function inviteBatchUsers(
  org_id: any,
  body: {
    emails: string[]
    role_id: number
    usergroup_id?: number
    new_usergroup_name?: string
    source?: 'manual' | 'csv' | 'api'
    batch_uuid?: string
    /** Staff only: what they may do (omitted means the defaults). */
    permissions?: string[]
    /** Staff only: running assignments they join, each in a role. */
    assignments?: InviteAssignment[]
    note?: string
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

export interface InvitePreview {
  kind: 'invitation' | 'link'
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired' | 'used_up'
  org: { id: number; name: string; slug: string; logo_image?: string | null; org_uuid: string }
  role: 'learner' | 'staff' | 'admin'
  group: string | null
  email: string | null
  inviter: { name: string; avatar_image?: string | null; user_uuid: string } | null
  /** Staff invitations: what they'll be able to do, the assignments they're on and the inviter's note. */
  permissions?: Array<{ key: string; label: string }>
  assignments?: Array<{ assignment_uuid: string; plan: string; assigned_to: string; role: AssignmentRoleKey; role_label: string }>
  note?: string
}

/** Who sent an invitation or join link, to what and for whom; public, since the token is the secret. */
export async function getInvitePreview(org_id: number, token: { invitation?: string; inviteCode?: string }): Promise<InvitePreview | null> {
  const query = token.invitation ? `invitation=${encodeURIComponent(token.invitation)}` : `invite_code=${encodeURIComponent(token.inviteCode || '')}`
  const result = await fetch(`${getAPIUrl()}orgs/${org_id}/invite-preview?${query}`)
  return result.ok ? result.json() : null
}
