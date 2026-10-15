import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalsUrl, goalUrl } from './goals'
import type { PersonSummary } from './types'

const q = encodeURIComponent

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type GoalPerson = PersonSummary & { email?: string }
export type RoleRef = { role_uuid: string | null; key: string; name: string }

export interface GoalCollaborator {
  /** Null for an owner who has no membership row. */
  collaborator_uuid: string | null
  user: GoalPerson | null
  role: RoleRef
  is_owner: boolean
  is_subject: boolean
}

export interface GoalRole {
  role_uuid: string
  key: string
  name: string
  capabilities: string[]
  grantable_role_keys: string[]
  locked: boolean
  organization_role_uuid: string | null
}

export interface SentInvitation {
  invitation_uuid: string
  email: string
  kind: 'collaborator' | 'subject'
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'
  role: { key: string; name: string } | null
  creation_date: string
}

/** Who is on a goal, what roles it has and, for managers, the invitations sent. */
export interface GoalPeople {
  goal_uuid: string
  is_owner: boolean
  capabilities: string[]
  collaborators: GoalCollaborator[]
  invitations: SentInvitation[]
  roles: GoalRole[]
  available_capabilities: string[]
  can_manage_organization_roles: boolean
}

export interface CollaboratorRequest {
  request_uuid: string
  email: string
  role_key: string
  message: string
  status: 'pending' | 'approved' | 'declined'
  requested_by: GoalPerson | null
  resolved_by: GoalPerson | null
  creation_date: string
  responded_at: string | null
}

type OrgRef = { id: number; org_uuid: string; name: string; slug: string; logo_image?: string | null }

/** An invitation the viewer received to work on someone's goal. */
export interface ReceivedInvitation {
  invitation_uuid: string
  kind: 'collaborator' | 'subject'
  status: string
  unread: boolean
  expires_at: string | null
  goal: { goal_uuid: string; title: string; description: string }
  organization: OrgRef | null
  subject: GoalPerson | null
  invited_by: GoalPerson | null
  role: { key: string; name: string }
}

/** A goal an organization handed the learner, shown on the organization page. */
export interface OrgGoalInvitation {
  goal_uuid: string
  org_id: number
  status: 'pending' | 'active'
  title: string
  unread: boolean
  viewed_at?: string | null
  created_at: string
  organization: OrgRef
  template: { template_uuid: string; title: string; description?: string | null; thumbnail_image?: string | null } | null
  group?: { id: number; name: string } | null
  assignment: { assignment_uuid: string; welcome_message?: string; start_date?: string | null; due_date?: string | null; active: boolean }
}

export const peopleKey = (goalUuid: string) => goalUrl(goalUuid, '/people')
export const collaboratorRequestsKey = (goalUuid: string) => goalUrl(goalUuid, '/collaborator-requests')
export const myInvitationsKey = () => goalsUrl('/invitations')
export const orgInvitationsKey = () => goalsUrl('/org-invitations')

export const goalSharingApi = {
  people: (goalUuid: string, token?: string) => request<GoalPeople>(peopleKey(goalUuid), token),
  updateRole: (goalUuid: string, roleUuid: string, data: { name?: string; capabilities?: string[]; grantable_role_keys?: string[] }, token?: string) => request(goalUrl(goalUuid, `/roles/${q(roleUuid)}`), token, 'PATCH', data),
  createOrganizationRole: (goalUuid: string, data: { name: string; capabilities: string[] }, token?: string) => request(goalUrl(goalUuid, '/organization-roles'), token, 'POST', data),
  updateOrganizationRole: (goalUuid: string, roleUuid: string, data: { name?: string; capabilities?: string[] }, token?: string) => request(goalUrl(goalUuid, `/organization-roles/${q(roleUuid)}`), token, 'PATCH', data),
  deleteOrganizationRole: (goalUuid: string, roleUuid: string, token?: string) => request(goalUrl(goalUuid, `/organization-roles/${q(roleUuid)}`), token, 'DELETE'),

  invite: (goalUuid: string, data: { email: string; role_key: string; kind?: 'collaborator' | 'subject' }, token?: string) => request(goalUrl(goalUuid, '/invitations'), token, 'POST', data),
  revokeInvitation: (goalUuid: string, invitationUuid: string, token?: string) => request(goalUrl(goalUuid, `/invitations/${q(invitationUuid)}`), token, 'DELETE'),
  collaboratorRequests: (goalUuid: string, token?: string) => request<CollaboratorRequest[]>(collaboratorRequestsKey(goalUuid), token),
  requestCollaborator: (goalUuid: string, data: { email: string; role_key: string; message?: string }, token?: string) => request<CollaboratorRequest>(collaboratorRequestsKey(goalUuid), token, 'POST', data),
  respondCollaboratorRequest: (goalUuid: string, requestUuid: string, approve: boolean, token?: string) => request(goalUrl(goalUuid, `/collaborator-requests/${q(requestUuid)}/respond`), token, 'POST', { approve }),
  updateCollaborator: (goalUuid: string, collaboratorUuid: string, roleKey: string, token?: string) => request<GoalPeople>(goalUrl(goalUuid, `/collaborators/${q(collaboratorUuid)}`), token, 'PATCH', { role_key: roleKey }),
  removeCollaborator: (goalUuid: string, collaboratorUuid: string, token?: string) => request(goalUrl(goalUuid, `/collaborators/${q(collaboratorUuid)}`), token, 'DELETE'),
  leave: (goalUuid: string, token?: string) => request(goalUrl(goalUuid, '/leave'), token, 'POST'),
  transferOwnership: (goalUuid: string, userId: number, token?: string) => request<GoalPeople>(goalUrl(goalUuid, '/transfer-ownership'), token, 'POST', { user_id: userId }),

  myInvitations: (token?: string) => request<ReceivedInvitation[]>(myInvitationsKey(), token),
  respondInvitation: (invitationUuid: string, accept: boolean, token?: string) => request<{ invitation_uuid: string; status: string; goal_uuid: string }>(goalsUrl(`/invitations/${q(invitationUuid)}/respond`), token, 'POST', { accept }),
  orgInvitations: (token?: string) => request<OrgGoalInvitation[]>(orgInvitationsKey(), token),
  markOrgInvitationsViewed: (token?: string) => request(goalsUrl('/org-invitations/viewed'), token, 'POST'),
}
