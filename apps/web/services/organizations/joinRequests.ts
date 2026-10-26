import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PersonSummary } from '@services/goals/types'

async function request(path: string, token?: string, method = 'GET', body: any = null) {
  const response = await fetch(`${getAPIUrl()}orgs/${path}`, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** Someone asking to join an invite-only organization; `person` when they have an account. */
export interface OrgJoinRequest {
  request_uuid: string
  status: 'requested' | 'approved' | 'declined'
  email: string
  name: string
  message: string
  creation_date: string
  person: PersonSummary | null
}

export type MyJoinRequest = { status: 'requested'; request_uuid: string } | { status: 'none' }

/** Asking to join an invite-only organization (signed in or not), and its staff answering. */
export const joinRequestsApi = {
  ask: (orgId: number, body: { email?: string; name?: string; message?: string }, token?: string): Promise<MyJoinRequest> => request(`${orgId}/join-requests`, token, 'POST', body),
  mine: (orgId: number, token: string): Promise<MyJoinRequest> => request(`${orgId}/join-requests/mine`, token),
  withdraw: (orgId: number, token: string): Promise<MyJoinRequest> => request(`${orgId}/join-requests/mine`, token, 'DELETE'),
  list: (orgId: number, token: string): Promise<OrgJoinRequest[]> => request(`${orgId}/join-requests`, token),
  answer: (requestUuid: string, approve: boolean, token: string): Promise<OrgJoinRequest & { invited: boolean }> =>
    request(`join-requests/${encodeURIComponent(requestUuid)}/${approve ? 'approve' : 'decline'}`, token, 'POST'),
}
