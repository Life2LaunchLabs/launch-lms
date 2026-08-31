import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type PlanLifecycle = 'pending' | 'active' | 'completed' | 'archived'
export type PlanScope = 'all' | 'mine' | 'helping'

async function request(path: string, token?: string, method = 'GET', body: any = null) {
  const response = await fetch(`${getAPIUrl()}planning${path}`, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export const planningApi = {
  plans: (token?: string, lifecycle?: PlanLifecycle) => request(`/plans${lifecycle ? `?lifecycle=${lifecycle}` : ''}`, token),
  plan: (identifier: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}`, token),
  reviews: (identifier: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/reviews`, token),
  resolveLegacy: (identifier: string, token?: string) => request(`/legacy/${encodeURIComponent(identifier)}`, token),
  feed: (token?: string, scope: PlanScope = 'all', planUuid?: string, exploreAll = false) => request(`/feed?scope=${scope}${planUuid ? `&plan_uuid=${encodeURIComponent(planUuid)}` : ''}${exploreAll ? '&explore_all=true' : ''}`, token),
  create: (data: any, token?: string) => request('/plans', token, 'POST', data),
  update: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}`, token, 'PATCH', data),
  remove: (identifier: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}`, token, 'DELETE'),
  status: (identifier: string, action: 'complete' | 'reopen' | 'archive', token?: string) => request(`/plans/${encodeURIComponent(identifier)}/${action}`, token, 'POST'),
  addPhase: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/phases`, token, 'POST', data),
  updatePhase: (identifier: string, phaseUuid: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/phases/${encodeURIComponent(phaseUuid)}`, token, 'PATCH', data),
  removePhase: (identifier: string, phaseUuid: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/phases/${encodeURIComponent(phaseUuid)}`, token, 'DELETE'),
  addObjective: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/objectives`, token, 'POST', data),
  updateObjective: (identifier: string, objectiveUuid: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/objectives/${encodeURIComponent(objectiveUuid)}`, token, 'PATCH', data),
  removeObjective: (identifier: string, objectiveUuid: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/objectives/${encodeURIComponent(objectiveUuid)}`, token, 'DELETE'),
  updateProgress: (identifier: string, objectiveUuid: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/objectives/${encodeURIComponent(objectiveUuid)}/progress`, token, 'PATCH', data),
  addRole: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/roles`, token, 'POST', data),
  updateRole: (identifier: string, roleUuid: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/roles/${encodeURIComponent(roleUuid)}`, token, 'PATCH', data),
  removeRole: (identifier: string, roleUuid: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/roles/${encodeURIComponent(roleUuid)}`, token, 'DELETE'),
  createOrganizationRole: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/organization-roles`, token, 'POST', data),
  updateOrganizationRole: (identifier: string, roleUuid: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/organization-roles/${encodeURIComponent(roleUuid)}`, token, 'PATCH', data),
  removeOrganizationRole: (identifier: string, roleUuid: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/organization-roles/${encodeURIComponent(roleUuid)}`, token, 'DELETE'),
  invite: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/invitations`, token, 'POST', data),
  collaboratorRequests: (identifier: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/collaborator-requests`, token),
  requestCollaborator: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/collaborator-requests`, token, 'POST', data),
  respondCollaboratorRequest: (identifier: string, requestUuid: string, approve: boolean, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/collaborator-requests/${encodeURIComponent(requestUuid)}/respond`, token, 'POST', { approve }),
  updateCollaborator: (identifier: string, collaboratorUuid: string, roleKey: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/collaborators/${encodeURIComponent(collaboratorUuid)}`, token, 'PATCH', { role_key: roleKey }),
  removeCollaborator: (identifier: string, collaboratorUuid: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/collaborators/${encodeURIComponent(collaboratorUuid)}`, token, 'DELETE'),
  leave: (identifier: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/leave`, token, 'POST'),
  transferOwnership: (identifier: string, userId: number, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/transfer-ownership`, token, 'POST', { user_id: userId }),
  activity: (identifier: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/activity`, token),
  comment: (identifier: string, body: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/comments`, token, 'POST', { body }),
  attachments: (identifier: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/attachments`, token),
  addAttachment: (identifier: string, assetUuid: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/attachments`, token, 'POST', { asset_uuid: assetUuid }),
  removeAttachment: (identifier: string, assetUuid: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/attachments/${encodeURIComponent(assetUuid)}`, token, 'DELETE'),
  invitations: (token?: string) => request('/invitations/me', token),
  respond: (invitationUuid: string, accept: boolean, token?: string) => request(`/invitations/${encodeURIComponent(invitationUuid)}/respond`, token, 'POST', { accept }),
}
