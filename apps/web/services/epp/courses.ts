import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PersonSummary } from '@services/goals/types'

/** A learner's course plan with a school, tallied against the 24 Oregon Diploma credits. */
export type CourseStatus = 'planned' | 'in_progress' | 'completed'
export type CourseSource = 'student' | 'staff' | 'cis'

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = { planned: 'Planned', in_progress: 'In progress', completed: 'Completed' }
export const COURSE_SOURCE_LABELS: Record<CourseSource, string> = { student: 'Student entered', staff: 'Staff entered', cis: 'From Oregon CIS' }

export interface EppCourse {
  course_uuid: string
  grade: number
  school_year: string | null
  subject: string
  title: string
  term: string | null
  credits: number
  status: CourseStatus
  course_code: string | null
  dual_credit: boolean
  dual_credit_school: string | null
  dual_credit_credits: number | null
  note: string | null
  source: CourseSource
  school_confirmed: boolean
  confirmed_at: string | null
  confirmed_by: PersonSummary | null
}

export interface CreditArea { subject: string; label: string; required: number; completed: number; planned: number; left: number }

export interface CoursePlan {
  courses: EppCourse[]
  tally: { areas: CreditArea[]; required: number; completed: number; planned: number; left: number; school_confirmed: number }
  subjects: Array<{ key: string; label: string; required: number }>
  cis_courses: number
  added?: number
}

export type CourseWrite = Partial<Pick<EppCourse, 'grade' | 'school_year' | 'subject' | 'title' | 'term' | 'credits' | 'status' | 'course_code' | 'dual_credit' | 'dual_credit_school' | 'dual_credit_credits' | 'note'>>

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

const student = (orgId: number, userId: number, path = '') => `${getAPIUrl()}epp/orgs/${orgId}/students/${userId}/courses${path}`
const one = (courseUuid: string) => `/${encodeURIComponent(courseUuid)}`

export const coursePlanKey = (orgId: number, userId: number) => student(orgId, userId)

/** Staff, for a learner the school supports. */
export const coursesApi = {
  plan: (orgId: number, userId: number, token?: string) => request<CoursePlan>(student(orgId, userId), token),
  add: (orgId: number, userId: number, payload: CourseWrite, token?: string) => request<CoursePlan>(student(orgId, userId), token, 'POST', payload),
  update: (orgId: number, userId: number, courseUuid: string, payload: CourseWrite, token?: string) => request<CoursePlan>(student(orgId, userId, one(courseUuid)), token, 'PUT', payload),
  remove: (orgId: number, userId: number, courseUuid: string, token?: string) => request<CoursePlan>(student(orgId, userId, one(courseUuid)), token, 'DELETE'),
  confirm: (orgId: number, userId: number, courseUuid: string, confirmed: boolean, token?: string) =>
    request<CoursePlan>(student(orgId, userId, `${one(courseUuid)}/confirm`), token, 'POST', { confirmed }),
  importCis: (orgId: number, userId: number, token?: string) => request<CoursePlan>(student(orgId, userId, '/import_cis'), token, 'POST'),
}
