import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { CoursePlan, CourseWrite } from './courses'

/** The Oregon Education Plan and Profile report, as the API builds it (schema_version 1). */
export type ComponentStatus = 'complete' | 'reviewed' | 'needs_attention'

export interface ReportWork {
  step: string
  status: string
  text: string[]
  items: string[]
  completed_at: string | null
  source: 'student_entered' | 'teacher_reviewed'
  reviewed_by: string | null
  review_required: boolean
}

export interface EvidenceItem {
  kind: 'credential' | 'result' | 'project' | 'experience' | 'quote'
  uuid: string
  title: string
  detail: string
  summary?: string
  type?: string
  date?: string | null
  end?: string | null
  ongoing?: boolean
  verified?: boolean
}

export interface EppReport {
  schema_version: number
  generated_at: string
  school_year: string
  org: { name: string }
  learner: { name: string; first_name: string; student_id: string | null; grade: number | null; graduation_year: number | null; diploma_track: string | null; diploma: string | null; counselor: string | null }
  next_step: string | null
  interests: string[]
  components: Array<{ key: string; label: string; status: ComponentStatus; detail: string }>
  to_talk_about: string[]
  graduation: { tally: CoursePlan['tally']; beyond_credits: Array<{ key: string; label: string; detail: string; attention?: boolean }> }
  courses: {
    grid: Array<{ subject: string; label: string; grades: Record<string, Array<{ title: string; status: string; dual_credit: boolean; school_confirmed: boolean }>> }>
    dual_credit: Array<{ title: string; grade: number; credits: number; college: string | null; college_credits: number | null; status: string }>
  }
  sections: Array<{ key: string; title: string; requirements: Array<{ code: string; label: string; work: ReportWork[] }> }>
  evidence: EvidenceItem[]
  reviews: Array<{ date: string; reviewer: string; outcome: string }>
}

export interface Pick { kind: EvidenceItem['kind']; uuid: string }
export interface MyReport { report: EppReport; choices: EvidenceItem[]; picks: Pick[] }

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

const base = () => `${getAPIUrl()}epp/orgs`

export const eppReportKey = (orgId: number, userId: number) => `${base()}/${orgId}/students/${userId}/report`
export const myEppKey = (orgId: number) => `${base()}/${orgId}/report`
export const myCoursesKey = (orgId: number) => `${base()}/${orgId}/courses`

export const eppReportApi = {
  staff: (orgId: number, userId: number, token?: string) => request<EppReport>(eppReportKey(orgId, userId), token),
  mine: (orgId: number, token?: string) => request<MyReport>(myEppKey(orgId), token),
  setPicks: (orgId: number, picks: Pick[], token?: string) => request<MyReport>(`${myEppKey(orgId)}/picks`, token, 'PUT', { picks }),
}

/** The learner's own course plan with a school that supports them. They can't confirm courses. */
export const myCoursesApi = {
  plan: (orgId: number, token?: string) => request<CoursePlan>(myCoursesKey(orgId), token),
  add: (orgId: number, payload: CourseWrite, token?: string) => request<CoursePlan>(myCoursesKey(orgId), token, 'POST', payload),
  update: (orgId: number, courseUuid: string, payload: CourseWrite, token?: string) => request<CoursePlan>(`${myCoursesKey(orgId)}/${encodeURIComponent(courseUuid)}`, token, 'PUT', payload),
  remove: (orgId: number, courseUuid: string, token?: string) => request<CoursePlan>(`${myCoursesKey(orgId)}/${encodeURIComponent(courseUuid)}`, token, 'DELETE'),
}
