import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

/** A school's Education Plan and Profile caseload, and its PDFs. */
export type ComponentKey = 'interests' | 'goals' | 'courses' | 'progress' | 'accomplishments'
export type CaseloadState = 'reviewed' | 'ready' | 'missing' | 'waiting'

export interface CaseloadLearner {
  user_id: number
  user_uuid?: string | null
  username: string | null
  name: string
  student_id: string | null
  grade: number | null
  counselor_user_id: number | null
  state: CaseloadState
  components: Partial<Record<ComponentKey, 'complete' | 'reviewed' | 'needs_attention'>>
  evidence: number
  last_review: string | null
  due: boolean
  open: string
}

export interface Caseload {
  school_year: string
  learners: CaseloadLearner[]
  counts: Record<'total' | CaseloadState, number>
  exportable: number
  /** The yearly EPP plan the school assigns, once it has one. */
  plan: { framework_uuid: string; template_uuid: string | null; published: boolean } | null
  /** Whether the viewer may set it up (staff who build plans). */
  can_set_up: boolean
}

const org = (orgId: number) => `${getAPIUrl()}epp/orgs/${orgId}`

export const caseloadKey = (orgId: number, mine: boolean) => `${org(orgId)}/caseload${mine ? '?mine=true' : ''}`

export async function getCaseload(orgId: number, mine: boolean, token?: string): Promise<Caseload> {
  return errorHandling(await fetch(caseloadKey(orgId, mine), RequestBodyWithAuthHeader('GET', null, null, token)))
}

/** Give the school the Oregon EPP framework and yearly plan, published and ready to assign. */
export async function setUpEpp(orgId: number, token?: string): Promise<NonNullable<Caseload['plan']>> {
  return errorHandling(await fetch(`${org(orgId)}/setup`, RequestBodyWithAuthHeader('POST', null, null, token)))
}

/** The file name the API gives (Last_First_StudentID_EPP_2026-27.pdf), or the fallback. */
function fileName(response: Response, fallback: string) {
  const header = response.headers.get('Content-Disposition') || ''
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/)
  if (encoded) return decodeURIComponent(encoded[1])
  return header.match(/filename="([^"]+)"/)?.[1] || fallback
}

async function download(url: string, fallback: string, token?: string) {
  const response = await fetch(url, RequestBodyWithAuthHeader('GET', null, null, token))
  if (!response.ok) {
    await errorHandling(response)
    throw new Error('That download didn’t work.')
  }
  return save(response, fallback)
}

async function save(response: Response, fallback: string) {
  const name = fileName(response, fallback)
  const href = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  return name
}

/** A zip with a PDF of each reviewed record this school year. */
export const downloadCaseloadExport = (orgId: number, mine: boolean, token?: string) =>
  download(`${org(orgId)}/caseload/export${mine ? '?mine=true' : ''}`, 'EPP.zip', token)

/** One saved record as a PDF. */
export const downloadRecordPdf = (orgId: number, recordUuid: string, token?: string) =>
  download(`${org(orgId)}/records/${encodeURIComponent(recordUuid)}/pdf`, 'EPP.pdf', token)

/** Insights: every learner's Education Plan and Profile, complete or not, by group (PL-7). */
export interface EppOverviewLearner extends CaseloadLearner { complete: boolean; groups: string[] }
export interface EppOverview {
  school_year: string
  learners: EppOverviewLearner[]
  see_reports: boolean
  counts: { total: number; complete: number; incomplete: number }
  groups: Array<{ usergroup_uuid: string; name: string }>
  group: { usergroup_uuid: string; name: string } | null
}
export const eppOverviewKey = (orgId: number, group?: string | null) => `${org(orgId)}/overview${group ? `?group=${encodeURIComponent(group)}` : ''}`
export async function getEppOverview(orgId: number, group: string | null, token?: string): Promise<EppOverview> {
  return errorHandling(await fetch(eppOverviewKey(orgId, group), RequestBodyWithAuthHeader('GET', null, null, token)))
}

/** A zip of the chosen learners' Education Plans and Profiles as they stand now, one PDF each. */
export async function downloadEppPdfs(orgId: number, userIds: number[], token?: string) {
  const response = await fetch(`${org(orgId)}/overview/export`, RequestBodyWithAuthHeader('POST', { user_ids: userIds }, null, token))
  if (!response.ok) {
    await errorHandling(response)
    throw new Error('That download didn’t work.')
  }
  return save(response, 'EPP.zip')
}
