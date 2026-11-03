import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

/** A school's Education Plan and Profile caseload, and its PDFs. */
export type ComponentKey = 'interests' | 'goals' | 'courses' | 'progress' | 'accomplishments'
export type CaseloadState = 'reviewed' | 'ready' | 'missing' | 'waiting'

export interface CaseloadLearner {
  user_id: number
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
}

const org = (orgId: number) => `${getAPIUrl()}epp/orgs/${orgId}`

export const caseloadKey = (orgId: number, mine: boolean) => `${org(orgId)}/caseload${mine ? '?mine=true' : ''}`

export async function getCaseload(orgId: number, mine: boolean, token?: string): Promise<Caseload> {
  return errorHandling(await fetch(caseloadKey(orgId, mine), RequestBodyWithAuthHeader('GET', null, null, token)))
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
