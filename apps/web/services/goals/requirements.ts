import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalAdminUrl } from './admin'
import type { StepStatus, StepTypeKey } from './types'

const q = encodeURIComponent

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

// Framework CRUD stays on its own API (not plan-based).
const frameworks = (path: string) => `${getAPIUrl()}requirement-frameworks${path}`

export interface RequirementNode { node_uuid: string; parent_node_uuid?: string | null; code?: string; title: string; description?: string; position?: number; metadata?: Record<string, unknown> }
export type RequirementState = 'met' | 'planned' | 'gap'

/** A step in the learner's goals that counts toward a requirement. */
export interface PlannedStep { goal_uuid: string; goal_title: string; step_uuid: string; title: string; status: StepStatus; due_date: string | null; overdue: boolean }
export interface RequirementSource { source_uuid: string; title: string; note?: string; kind: string; verified_by: { first_name?: string; username?: string } | null; verified_at: string | null }
export interface LearnerNode extends RequirementNode { leaf: boolean; state: RequirementState | null; steps: PlannedStep[]; sources: RequirementSource[] }
export interface LearnerFramework { enrollment_uuid: string; framework_uuid: string; name: string; version: number; status: string; met: number; total: number; gaps: number; nodes: LearnerNode[] }
export interface LearnerRequirements { user_id: number; frameworks: LearnerFramework[]; goals: Array<{ goal_uuid: string; title: string; status: string }> }

export interface MakeupOption { template_uuid: string; step_key: string; title: string; description: string; type: StepTypeKey; template: { template_uuid: string; title: string } }

export interface GroupRequirements {
  group: { id: number; name: string }
  frameworks: Array<{ framework_uuid: string; name: string; learner_count: number }>
  framework_uuid: string | null
  nodes: RequirementNode[]
  leaf_node_uuids: string[]
  learners: Array<{ id: number; username?: string; first_name?: string; last_name?: string; enrollment_uuid: string; version: number; met: number; total: number; gaps: number; cells: Record<string, RequirementState | null> }>
  not_enrolled: number
}

export interface Coverage {
  framework: { framework_uuid: string; name: string; description: string; version: number; status: string }
  templates: Array<{ template_uuid: string; title: string; mapped: boolean }>
  nodes: Array<RequirementNode & { covered_by: Array<{ template_uuid: string; step_key: string; title: string; step_types: StepTypeKey[] }> }>
}

export type EvidenceExportScope = { user_ids: number[]; assignment_uuid?: string; usergroup_id?: number; framework_uuid?: string; course_name?: string; course_code?: string; section?: string; term?: string }

export const frameworksKey = (orgId: number) => frameworks(`?org_id=${orgId}`)
export const learnerRequirementsKey = (orgId: number, userId: number) => goalAdminUrl(`/managed-users/${userId}/requirements`, orgId)

/** Requirement frameworks, and where learners stand on them as read from goal steps. */
export const requirementsApi = {
  list: (orgId: number, token?: string) => request<any[]>(frameworksKey(orgId), token),
  get: (orgId: number, uuid: string, token?: string, version?: number) => request(frameworks(`/${q(uuid)}?org_id=${orgId}${version ? `&version=${version}` : ''}`), token),
  create: (orgId: number, data: any, token?: string) => request(frameworks(''), token, 'POST', { ...data, org_id: orgId }),
  library: (orgId: number, query = '', token?: string) => request<any[]>(frameworks(`/library?org_id=${orgId}&q=${q(query)}`), token),
  copyFromLibrary: (orgId: number, uuid: string, token?: string) => request(frameworks(`/library/${q(uuid)}/copy?org_id=${orgId}`), token, 'POST'),
  publishToLibrary: (orgId: number, uuid: string, token?: string) => request(frameworks(`/${q(uuid)}/publish-to-library?org_id=${orgId}`), token, 'POST'),
  update: (orgId: number, uuid: string, data: any, token?: string) => request(frameworks(`/${q(uuid)}?org_id=${orgId}`), token, 'PATCH', data),
  publish: (orgId: number, uuid: string, token?: string) => request(frameworks(`/${q(uuid)}/publish?org_id=${orgId}`), token, 'POST'),
  assign: (orgId: number, uuid: string, data: { usergroup_id?: number; user_id?: number }, token?: string) => request(frameworks(`/${q(uuid)}/assignments?org_id=${orgId}`), token, 'POST', data),
  migrateActive: (orgId: number, uuid: string, enrollmentUuids: string[] | null, token?: string) => request(frameworks(`/${q(uuid)}/migrate-active?org_id=${orgId}`), token, 'POST', { enrollment_uuids: enrollmentUuids }),

  coverage: (orgId: number, uuid: string, token?: string) => request<Coverage>(goalAdminUrl(`/requirements/${q(uuid)}/coverage`, orgId), token),
  learner: (orgId: number, userId: number, token?: string) => request<LearnerRequirements>(learnerRequirementsKey(orgId, userId), token),
  makeupOptions: (orgId: number, userId: number, nodeUuid: string, token?: string) => request<MakeupOption[]>(goalAdminUrl(`/managed-users/${userId}/makeup-options?node_uuid=${q(nodeUuid)}`, orgId), token),
  addMakeup: (orgId: number, userId: number, data: { goal_uuid: string; node_uuid: string; template_uuid?: string | null; step_key?: string | null; title?: string | null; due_date?: string | null }, token?: string) => request<{ goal_uuid: string; step_uuid: string; title: string }>(goalAdminUrl(`/managed-users/${userId}/makeup`, orgId), token, 'POST', data),
  credit: (orgId: number, userId: number, data: { enrollment_uuid: string; node_uuid: string; note: string }, token?: string) => request(goalAdminUrl(`/managed-users/${userId}/requirements/credit`, orgId), token, 'POST', data),
  group: (orgId: number, groupId: number, frameworkUuid?: string | null, token?: string) => request<GroupRequirements>(goalAdminUrl(`/groups/${groupId}/requirements${frameworkUuid ? `?framework_uuid=${q(frameworkUuid)}` : ''}`, orgId), token),
}

/** Downloads the requirement evidence CSV for the learners in scope. */
export async function downloadRequirementEvidence(orgId: number, scope: EvidenceExportScope, token?: string) {
  const response = await fetch(goalAdminUrl('/requirements/evidence-export', orgId), RequestBodyWithAuthHeader('POST', scope, null, token))
  if (!response.ok) {
    await errorHandling(response)
    throw new Error('Could not export requirement evidence.')
  }
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'requirement-evidence.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
