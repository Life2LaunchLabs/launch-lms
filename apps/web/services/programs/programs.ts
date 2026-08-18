import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

async function request(path: string, token: string | undefined, method = 'GET', body: any = null) {
  const response = await fetch(
    `${getAPIUrl()}programs${path}`,
    RequestBodyWithAuthHeader(method, body, null, token)
  )
  return errorHandling(response)
}

export const programsApi = {
  list: (orgId: number, token?: string) => request(`/?org_id=${orgId}`, token),
  create: (orgId: number, data: any, token?: string) => request('/', token, 'POST', { ...data, org_id: orgId }),
  get: (orgId: number, uuid: string, token?: string) => request(`/${encodeURIComponent(uuid)}?org_id=${orgId}`, token),
  update: (orgId: number, uuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}?org_id=${orgId}`, token, 'PUT', data),
  objectives: (orgId: number, token?: string) => request(`/objectives?org_id=${orgId}`, token),
  addObjective: (orgId: number, uuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}/objectives?org_id=${orgId}`, token, 'POST', data),
  updateBadgeVersions: (orgId: number, uuid: string, token?: string) => request(`/${encodeURIComponent(uuid)}/update-badge-versions?org_id=${orgId}`, token, 'POST'),
  assign: (orgId: number, uuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}/assign?org_id=${orgId}`, token, 'POST', data),
  cohort: (orgId: number, groupId: number, token?: string) => request(`/cohorts/${groupId}?org_id=${orgId}`, token),
  matrix: (orgId: number, assignmentUuid: string, token?: string) => request(`/assignments/${encodeURIComponent(assignmentUuid)}/matrix?org_id=${orgId}`, token),
  updateProgress: (orgId: number, data: any, token?: string) => request(`/progress?org_id=${orgId}`, token, 'POST', data),
  user: (orgId: number, userId: number, token?: string) => request(`/users/${userId}?org_id=${orgId}`, token),
  mine: (orgId: number, token?: string) => request(`/me?org_id=${orgId}`, token),
  updateMine: (orgId: number, data: any, token?: string) => request(`/me/progress?org_id=${orgId}`, token, 'POST', data),
  respond: (orgId: number, participantUuid: string, accept: boolean, token?: string) => request(`/invitations/${encodeURIComponent(participantUuid)}/respond?org_id=${orgId}`, token, 'POST', { accept }),
}
