import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalAdminUrl } from './admin'
import type { GoalAssignmentSummary } from './templates'
import type { AssignmentBadge } from './versionStatus'

export * from './versionStatus'

const q = encodeURIComponent

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type StepChange = 'added' | 'removed' | 'changed' | 'moved'
export interface VersionStepChange { step_key: string; title: string; type: string; change: StepChange; fields?: string[]; moved_from?: string; started_count: number }
export interface VersionStageChange { stage_key: string; title: string; change: 'added' | 'removed' | 'changed' | 'same'; fields: string[]; steps: VersionStepChange[] }

/** What moving an assignment to a version would change (apps/api/src/services/goals/assignment_versions.py). */
export interface VersionChanges {
  assignment_uuid: string
  current: { version_uuid: string; number: number; published_at: string | null } | null
  target: { version_uuid: string; number: number; note: string; published_at: string | null; eligible: boolean | null }
  badge: AssignmentBadge | null
  current_eligible: boolean | null
  open_plans: number
  stages: VersionStageChange[]
  has_changes: boolean
}

export interface AppliedVersion { plans: number; rewritten: number; added: number; removed: number; kept_started: number }

export const versionChangesKey = (orgId: number, assignmentUuid: string, versionUuid?: string | null) =>
  goalAdminUrl(`/assignments/${q(assignmentUuid)}/version-changes${versionUuid ? `?version_uuid=${q(versionUuid)}` : ''}`, orgId)

export const assignmentVersionsApi = {
  changes: (orgId: number, assignmentUuid: string, token?: string, versionUuid?: string | null) => request<VersionChanges>(versionChangesKey(orgId, assignmentUuid, versionUuid), token),
  apply: (orgId: number, assignmentUuid: string, versionUuid: string, token?: string) =>
    request<GoalAssignmentSummary & { applied: AppliedVersion }>(goalAdminUrl(`/assignments/${q(assignmentUuid)}/apply-version`, orgId), token, 'POST', { version_uuid: versionUuid }),
}
