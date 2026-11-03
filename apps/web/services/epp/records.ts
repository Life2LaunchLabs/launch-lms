import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { EppReport } from './report'

/** Frozen Education Plan and Profile records a school keeps. Corrections are new versions. */
export type RecordKind = 'annual' | 'final' | 'transfer' | 'exit'

export const RECORD_KIND_LABELS: Record<RecordKind, string> = { annual: 'Yearly review', final: 'Final review', transfer: 'Transfer', exit: 'Left the school' }

export interface RecordSummary {
  record_uuid: string
  kind: RecordKind
  version: number
  school_year: string
  learner_name: string
  student_id: string | null
  user_id: number | null
  outcome: string
  reviewed_by: string
  reviewed_at: string
  superseded: boolean
  record_id: string
}

export interface EppRecord extends RecordSummary {
  staff_comment: string
  learner_comment: string
  report: EppReport
  corrects: string | null
  correction_reason: string | null
}

export interface RecordCreate { kind: Exclude<RecordKind, 'exit'>; outcome: string; staff_comment: string; learner_comment: string }
export interface RecordCorrection { reason: string; outcome?: string; staff_comment?: string; learner_comment?: string; student_id?: string | null }

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

const org = (orgId: number) => `${getAPIUrl()}epp/orgs/${orgId}`

export const recordsKey = (orgId: number, userId?: number | null) => `${org(orgId)}/records${userId ? `?user_id=${userId}` : ''}`
export const recordKey = (orgId: number, recordUuid: string) => `${org(orgId)}/records/${encodeURIComponent(recordUuid)}`

export const recordsApi = {
  list: (orgId: number, userId?: number | null, token?: string) => request<{ records: RecordSummary[] }>(recordsKey(orgId, userId), token),
  open: (orgId: number, recordUuid: string, token?: string) => request<EppRecord>(recordKey(orgId, recordUuid), token),
  review: (orgId: number, userId: number, payload: RecordCreate, token?: string) => request<EppRecord>(`${org(orgId)}/students/${userId}/records`, token, 'POST', payload),
  correct: (orgId: number, recordUuid: string, payload: RecordCorrection, token?: string) => request<EppRecord>(`${recordKey(orgId, recordUuid)}/corrections`, token, 'POST', payload),
}
