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
  feed: (token?: string, scope: PlanScope = 'all', planUuid?: string) => request(`/feed?scope=${scope}${planUuid ? `&plan_uuid=${encodeURIComponent(planUuid)}` : ''}`, token),
  create: (data: any, token?: string) => request('/plans', token, 'POST', data),
  update: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}`, token, 'PATCH', data),
  remove: (identifier: string, token?: string) => request(`/plans/${encodeURIComponent(identifier)}`, token, 'DELETE'),
  status: (identifier: string, action: 'complete' | 'reopen' | 'archive', token?: string) => request(`/plans/${encodeURIComponent(identifier)}/${action}`, token, 'POST'),
  addPhase: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/phases`, token, 'POST', data),
  addObjective: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/objectives`, token, 'POST', data),
  updateProgress: (identifier: string, objectiveUuid: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/objectives/${encodeURIComponent(objectiveUuid)}/progress`, token, 'PATCH', data),
  invite: (identifier: string, data: any, token?: string) => request(`/plans/${encodeURIComponent(identifier)}/invitations`, token, 'POST', data),
  invitations: (token?: string) => request('/invitations/me', token),
  respond: (invitationUuid: string, accept: boolean, token?: string) => request(`/invitations/${encodeURIComponent(invitationUuid)}/respond`, token, 'POST', { accept }),
}
