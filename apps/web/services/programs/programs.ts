import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

async function request(path: string, token: string | undefined, method = 'GET', body: any = null) {
  const response = await fetch(
    `${getAPIUrl()}programs${path}`,
    RequestBodyWithAuthHeader(method, body, null, token)
  )
  return errorHandling(response)
}

async function planningRequest(path: string, token: string | undefined, method = 'GET', body: any = null) {
  const response = await fetch(
    `${getAPIUrl()}planning${path}`,
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
  list: (orgId: number, token?: string) => planningRequest(`/templates?org_id=${orgId}`, token),
  create: (orgId: number, data: any, token?: string) => planningRequest('/templates', token, 'POST', { ...data, org_id: orgId }),
  library: (orgId: number, query = '', token?: string) => planningRequest(`/templates/library?org_id=${orgId}&q=${encodeURIComponent(query)}`, token),
  copyFromLibrary: (orgId: number, uuid: string, token?: string) => planningRequest(`/templates/library/${encodeURIComponent(uuid)}/copy?org_id=${orgId}`, token, 'POST'),
  publishToLibrary: (orgId: number, uuid: string, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/publish-to-library?org_id=${orgId}`, token, 'POST'),
  get: (orgId: number, uuid: string, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}?org_id=${orgId}`, token),
  update: (orgId: number, uuid: string, data: any, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}?org_id=${orgId}`, token, 'PATCH', data),
  delete: (orgId: number, uuid: string, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}?org_id=${orgId}`, token, 'DELETE'),
  addObjective: (orgId: number, uuid: string, data: any, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/objectives?org_id=${orgId}`, token, 'POST', objectiveCreateData(data)),
  updateObjective: (orgId: number, uuid: string, objectiveUuid: string, data: any, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/objectives/${encodeURIComponent(objectiveUuid)}?org_id=${orgId}`, token, 'PUT', data),
  updateObjectiveRequirements: (orgId: number, uuid: string, objectiveUuid: string, nodeUuids: string[], token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/objectives/${encodeURIComponent(objectiveUuid)}/requirements?org_id=${orgId}`, token, 'PUT', { node_uuids: nodeUuids }),
  createPhase: (orgId: number, uuid: string, data: any, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/phases?org_id=${orgId}`, token, 'POST', data),
  updatePhase: (orgId: number, uuid: string, phaseUuid: string, data: any, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/phases/${encodeURIComponent(phaseUuid)}?org_id=${orgId}`, token, 'PUT', data),
  reorder: (orgId: number, uuid: string, phases: any[], token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/order?org_id=${orgId}`, token, 'PUT', { phases }),
  updateBadgeVersions: (orgId: number, uuid: string, acceptPrevious: boolean, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/update-badge-versions?org_id=${orgId}&accept_previous_major_versions=${acceptPrevious}`, token, 'POST'),
  versions: (orgId: number, uuid: string, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/versions?org_id=${orgId}`, token),
  publishVersion: (orgId: number, uuid: string, note: string, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/versions/publish?org_id=${orgId}`, token, 'POST', { note }),
  restoreVersion: (orgId: number, uuid: string, number: number, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/versions/${number}/restore?org_id=${orgId}`, token, 'POST', { note: '' }),
  assign: (orgId: number, uuid: string, data: any, token?: string) => planningRequest(`/templates/${encodeURIComponent(uuid)}/assignment-batches?org_id=${orgId}`, token, 'POST', data),
  assignments: (orgId: number, token?: string) => planningRequest(`/assignment-batches?org_id=${orgId}`, token),
  cohort: (orgId: number, groupId: number, token?: string) => planningRequest(`/cohorts/${groupId}?org_id=${orgId}`, token),
  matrix: (orgId: number | undefined, assignmentUuid: string, token?: string) => planningRequest(`/assignment-batches/${encodeURIComponent(assignmentUuid)}/matrix${orgId ? `?org_id=${orgId}` : ''}`, token),
  reviews: (orgId: number, assignmentUuid: string, token?: string) => planningRequest(`/assignment-batches/${encodeURIComponent(assignmentUuid)}/reviews?org_id=${orgId}`, token),
  updateProgress: (orgId: number, data: any, token?: string) => planningRequest(`/assignment-batches/progress?org_id=${orgId}`, token, 'POST', data),
  user: (orgId: number, userId: number, token?: string) => planningRequest(`/managed-users/${userId}?org_id=${orgId}`, token),
  respond: (orgId: number, participantUuid: string, accept: boolean, token?: string) => request(`/invitations/${encodeURIComponent(participantUuid)}/respond?org_id=${orgId}`, token, 'POST', { accept }),
}

export const requirementsApi = {
  list: (orgId: number, token?: string) => planningRequest(`/requirements?org_id=${orgId}`, token),
  get: (orgId: number, uuid: string, token?: string, version?: number) => planningRequest(`/requirements/${encodeURIComponent(uuid)}?org_id=${orgId}${version ? `&version=${version}` : ''}`, token),
  create: (orgId: number, data: any, token?: string) => planningRequest('/requirements', token, 'POST', { ...data, org_id: orgId }),
  library: (orgId: number, query = '', token?: string) => planningRequest(`/requirements/library?org_id=${orgId}&q=${encodeURIComponent(query)}`, token),
  copyFromLibrary: (orgId: number, uuid: string, token?: string) => planningRequest(`/requirements/library/${encodeURIComponent(uuid)}/copy?org_id=${orgId}`, token, 'POST'),
  publishToLibrary: (orgId: number, uuid: string, token?: string) => planningRequest(`/requirements/${encodeURIComponent(uuid)}/publish-to-library?org_id=${orgId}`, token, 'POST'),
  update: (orgId: number, uuid: string, data: any, token?: string) => planningRequest(`/requirements/${encodeURIComponent(uuid)}?org_id=${orgId}`, token, 'PATCH', data),
  publish: (orgId: number, uuid: string, token?: string) => planningRequest(`/requirements/${encodeURIComponent(uuid)}/publish?org_id=${orgId}`, token, 'POST'),
  assign: (orgId: number, uuid: string, data: any, token?: string) => planningRequest(`/requirements/${encodeURIComponent(uuid)}/assignments?org_id=${orgId}`, token, 'POST', data),
  migrateActive: (orgId: number, uuid: string, enrollmentUuids: string[] | null, token?: string) => planningRequest(`/requirements/${encodeURIComponent(uuid)}/migrate-active?org_id=${orgId}`, token, 'POST', { enrollment_uuids: enrollmentUuids }),
  coverage: (orgId: number, uuid: string, token?: string) => planningRequest(`/requirements/${encodeURIComponent(uuid)}/coverage?org_id=${orgId}`, token),
}

export type InboxKind = 'review' | 'grade' | 'confirm' | 'nudge'

export const planInboxApi = {
  inbox: (orgId: number, token?: string) => planningRequest(`/inbox?org_id=${orgId}`, token),
  queue: (orgId: number, params: { assignment: string; objective?: string | null; step?: string | null }, token?: string) => {
    const search = new URLSearchParams({ org_id: String(orgId), assignment_uuid: params.assignment })
    if (params.objective) search.set('objective_uuid', params.objective)
    if (params.step) search.set('plan_objective_uuid', params.step)
    return planningRequest(`/inbox/queue?${search.toString()}`, token)
  },
  decide: (orgId: number, planObjectiveUuid: string, action: 'confirm' | 'flag', message: string, token?: string) => planningRequest(`/inbox/decide?org_id=${orgId}`, token, 'POST', { plan_objective_uuid: planObjectiveUuid, action, message }),
  confirm: (orgId: number, planObjectiveUuids: string[], message: string, token?: string) => planningRequest(`/inbox/confirm?org_id=${orgId}`, token, 'POST', { plan_objective_uuids: planObjectiveUuids, message }),
  addStaffNote: (orgId: number, planObjectiveUuid: string, message: string, token?: string) => planningRequest(`/inbox/staff-notes?org_id=${orgId}`, token, 'POST', { plan_objective_uuid: planObjectiveUuid, message }),
}

export const learnerAdminApi = {
  requirements: (orgId: number, userId: number, token?: string) => planningRequest(`/managed-users/${userId}/requirements?org_id=${orgId}`, token),
  makeupOptions: (orgId: number, userId: number, nodeUuid: string, token?: string) => planningRequest(`/managed-users/${userId}/makeup-options?org_id=${orgId}&node_uuid=${encodeURIComponent(nodeUuid)}`, token),
  addMakeup: (orgId: number, userId: number, data: { plan_uuid: string; node_uuid: string; objective_uuid?: string | null; title?: string | null; due_date?: string | null }, token?: string) => planningRequest(`/managed-users/${userId}/makeup?org_id=${orgId}`, token, 'POST', data),
  groupRequirements: (orgId: number, groupId: number, frameworkUuid?: string | null, token?: string) => planningRequest(`/groups/${groupId}/requirements?org_id=${orgId}${frameworkUuid ? `&framework_uuid=${encodeURIComponent(frameworkUuid)}` : ''}`, token),
  credit: (orgId: number, userId: number, data: { enrollment_uuid: string; node_uuid: string; note: string }, token?: string) => planningRequest(`/managed-users/${userId}/requirements/credit?org_id=${orgId}`, token, 'POST', data),
}
