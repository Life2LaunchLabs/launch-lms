import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type LearnerProgramStatus = 'invited' | 'active' | 'completed' | 'declined' | 'left'

export interface LearnerProgramEnrollment {
  participant_uuid: string
  status: LearnerProgramStatus
  created_at: string
  enrollment_count: number
  organization: { id: number; org_uuid: string; name: string; slug: string; logo_image?: string | null }
  program: { program_uuid: string; slug: string; name: string; description?: string; instructions?: string; thumbnail_image?: string }
  assignment: Record<string, any>
  run: Record<string, any>
  enrollment: Record<string, any>
  objectives: any[]
}

export interface LearnerProgramDetailResponse {
  program: LearnerProgramEnrollment['program']
  organization: LearnerProgramEnrollment['organization']
  current_enrollment: LearnerProgramEnrollment
  enrollments: LearnerProgramEnrollment[]
}

async function request(path: string, token: string | undefined, method = 'GET', body: any = null) {
  const response = await fetch(
    `${getAPIUrl()}programs${path}`,
    RequestBodyWithAuthHeader(method, body, null, token)
  )
  return errorHandling(response)
}

function objectiveCreateData(data: any) {
  const schedule = data?.custom_fields?.__schedule
  if (!schedule) return data
  return { ...data, ...schedule, custom_fields: [...data.custom_fields] }
}

export const programsApi = {
  list: (orgId: number, token?: string) => request(`/?org_id=${orgId}`, token),
  create: (orgId: number, data: any, token?: string) => request('/', token, 'POST', { ...data, org_id: orgId }),
  get: (orgId: number, uuid: string, token?: string) => request(`/${encodeURIComponent(uuid)}?org_id=${orgId}`, token),
  update: (orgId: number, uuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}?org_id=${orgId}`, token, 'PUT', data),
  delete: (orgId: number, uuid: string, token?: string) => request(`/${encodeURIComponent(uuid)}?org_id=${orgId}`, token, 'DELETE'),
  objectives: (orgId: number, token?: string) => request(`/objectives?org_id=${orgId}`, token),
  addObjective: (orgId: number, uuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}/objectives?org_id=${orgId}`, token, 'POST', objectiveCreateData(data)),
  updateObjectiveSchedule: (orgId: number, uuid: string, objectiveUuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}/objectives/${encodeURIComponent(objectiveUuid)}/schedule?org_id=${orgId}`, token, 'PUT', data),
  updateObjective: (orgId: number, uuid: string, objectiveUuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}/objectives/${encodeURIComponent(objectiveUuid)}?org_id=${orgId}`, token, 'PUT', data),
  createPhase: (orgId: number, uuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}/phases?org_id=${orgId}`, token, 'POST', data),
  updatePhase: (orgId: number, uuid: string, phaseUuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}/phases/${encodeURIComponent(phaseUuid)}?org_id=${orgId}`, token, 'PUT', data),
  reorder: (orgId: number, uuid: string, phases: any[], token?: string) => request(`/${encodeURIComponent(uuid)}/order?org_id=${orgId}`, token, 'PUT', { phases }),
  updateBadgeVersions: (orgId: number, uuid: string, acceptPrevious: boolean, token?: string) => request(`/${encodeURIComponent(uuid)}/update-badge-versions?org_id=${orgId}&accept_previous_major_versions=${acceptPrevious}`, token, 'POST'),
  assign: (orgId: number, uuid: string, data: any, token?: string) => request(`/${encodeURIComponent(uuid)}/assign?org_id=${orgId}`, token, 'POST', data),
  cohort: (orgId: number, groupId: number, token?: string) => request(`/cohorts/${groupId}?org_id=${orgId}`, token),
  matrix: (orgId: number, assignmentUuid: string, token?: string) => request(`/assignments/${encodeURIComponent(assignmentUuid)}/matrix?org_id=${orgId}`, token),
  reviews: (orgId: number, assignmentUuid: string, token?: string) => request(`/assignments/${encodeURIComponent(assignmentUuid)}/reviews?org_id=${orgId}`, token),
  reviewObjective: (orgId: number, assignmentUuid: string, data: any, token?: string) => request(`/assignments/${encodeURIComponent(assignmentUuid)}/reviews/objective?org_id=${orgId}`, token, 'POST', data),
  updateProgress: (orgId: number, data: any, token?: string) => request(`/progress?org_id=${orgId}`, token, 'POST', data),
  user: (orgId: number, userId: number, token?: string) => request(`/users/${userId}?org_id=${orgId}`, token),
  mine: (orgId: number, token?: string) => request(`/me?org_id=${orgId}`, token),
  mineAll: (token?: string) => request('/me/all/details', token),
  mineBySlug: (programSlug: string, token?: string) => request(`/me/programs/${encodeURIComponent(programSlug)}`, token),
  enrollment: (participantUuid: string, token?: string) => request(`/me/enrollments/${encodeURIComponent(participantUuid)}`, token),
  updateMine: (orgId: number, data: any, token?: string) => request(`/me/progress?org_id=${orgId}`, token, 'POST', data),
  respond: (orgId: number, participantUuid: string, accept: boolean, token?: string) => request(`/invitations/${encodeURIComponent(participantUuid)}/respond?org_id=${orgId}`, token, 'POST', { accept }),
}
