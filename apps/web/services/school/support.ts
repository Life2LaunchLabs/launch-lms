import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PersonSummary } from '@services/goals/types'

/** A school's support link with a learner: staff ask, the learner accepts, and either can end it. */
export type SupportStatus = 'none' | 'requested' | 'active' | 'declined' | 'ended'
export type DiplomaTrack = 'standard' | 'modified' | 'extended' | 'alternative_certificate'

export const DIPLOMA_TRACK_LABELS: Record<DiplomaTrack, string> = {
  standard: 'Standard diploma',
  modified: 'Modified diploma',
  extended: 'Extended diploma',
  alternative_certificate: 'Alternative certificate',
}

export interface SupportState {
  status: SupportStatus
  support_uuid: string | null
  requested_at: string | null
  consent_at: string | null
  ended_at: string | null
  diploma_tracks?: DiplomaTrack[]
}

export interface SupportRecord extends SupportState {
  consent_version: string | null
  student_id: string | null
  diploma_track: DiplomaTrack | null
  graduation_year: number | null
  counselor: PersonSummary | null
  requested_by: PersonSummary | null
}

/** A supported learner as the school sees them. Needs an active link. */
export interface SupportedLearner { learner: PersonSummary; record: SupportRecord; portfolio: any | null }

export interface SupportUpdate { student_id?: string | null; diploma_track?: DiplomaTrack | null; graduation_year?: number | null; counselor_user_id?: number | null }

/** The consent card in a learner's chat with an organization. */
export interface SupportRequestCard {
  type: 'support_request'
  support_uuid: string
  request_uuid: string
  org_name: string
  org_slug: string
  text: string
  state: 'pending' | 'accepted' | 'declined' | 'ended' | 'expired'
  for_me: boolean
}

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

const student = (orgId: number, userId: number, path = 'support') => `${getAPIUrl()}school/orgs/${orgId}/students/${userId}/${path}`
const mine = (path = '') => `${getAPIUrl()}school/support${path}`

export const supportKey = (orgId: number, userId: number) => student(orgId, userId)
export const supportedLearnerKey = (orgId: number, userId: number) => student(orgId, userId, 'record')

export const supportApi = {
  status: (orgId: number, userId: number, token?: string) => request<SupportState>(student(orgId, userId), token),
  ask: (orgId: number, userId: number, token?: string) => request<SupportState>(student(orgId, userId), token, 'POST'),
  update: (orgId: number, userId: number, payload: SupportUpdate, token?: string) => request<SupportRecord>(student(orgId, userId), token, 'PUT', payload),
  end: (orgId: number, userId: number, token?: string) => request<SupportState>(student(orgId, userId), token, 'DELETE'),
  open: (orgId: number, userId: number, token?: string) => request<SupportedLearner>(student(orgId, userId, 'record'), token),
  mine: (token?: string) => request<{ supports: Array<SupportState & { org: { id: number; name: string; slug: string; org_uuid: string } | null }> }>(mine(), token),
  answer: (supportUuid: string, accept: boolean, requestUuid?: string, token?: string) =>
    request(mine(`/${encodeURIComponent(supportUuid)}/answer`), token, 'POST', { accept, request_uuid: requestUuid }),
  stop: (supportUuid: string, token?: string) => request(mine(`/${encodeURIComponent(supportUuid)}/end`), token, 'POST'),
}
