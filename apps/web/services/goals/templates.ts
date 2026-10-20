import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { GoalTemplate, TemplateDocument } from './types'
import type { AssignmentBadge, AssignmentVersionStatus, EligibilityRule } from './versions'

const q = encodeURIComponent

export const templatesUrl = (path = '') => `${getAPIUrl()}goal-templates${path}`
export const templateUrl = (templateUuid: string, path = '') => templatesUrl(`/${q(templateUuid)}${path}`)
const withOrg = (url: string, orgId: number, extra = '') => `${url}${url.includes('?') ? '&' : '?'}org_id=${orgId}${extra}`

// Any SWR key under /goal-templates, for revalidating after a change.
export const isTemplatesKey = (key: unknown) => typeof key === 'string' && key.startsWith(templatesUrl())

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** A draft badge step pinned to an older major version of its badge. */
export interface OutdatedBadgeStep {
  stage_key: string
  step_key: string
  title: string
  badge_uuid: string
  badge_name: string
  major_version: number
  latest_major_version: number
  earlier_version_holder_count: number
  version_comparison: Record<'previous' | 'latest', { semantic_version: string; title: string; description: string }>
}

/** One template as the editor reads it: the draft document, its etag, versions and library status. */
export interface TemplateDetail extends GoalTemplate {
  document: TemplateDocument
  published_to_library?: boolean
  library_published_at?: string | null
  source_template_uuid?: string | null
  outdated_badge_steps?: OutdatedBadgeStep[]
  /** Another organization's badge template this one runs: the published version, not editable here. */
  read_only?: boolean
  badge?: AssignmentBadge | null
}

export interface LibraryTemplate {
  template_uuid: string
  title: string
  description: string
  thumbnail_image: string
  stage_count: number
  step_count: number
  published_at: string | null
  owner_org_name: string
}

export interface AssignmentPerson { id: number; user_uuid?: string; username?: string; first_name?: string; last_name?: string; avatar_image?: string | null }

export interface GoalAssignmentSummary extends AssignmentVersionStatus {
  assignment_uuid: string
  template_uuid: string
  template_title: string
  usergroup_id: number | null
  user_id: number | null
  subject_email: string | null
  welcome_message: string
  staff: AssignmentPerson[]
  owner: AssignmentPerson | null
  start_date: string | null
  due_date: string | null
  status: 'active' | 'paused' | 'ended'
  creation_date: string
  cohort: { id: number; uuid: string; name: string } | null
  user: AssignmentPerson | null
  assignment_type: 'group' | 'individual' | 'external'
  learner_count: number
  goal_uuid: string | null
  step_count: number
  completed_count: number
  ready_for_review_count: number
  progress_percent: number
  [key: string]: unknown
}

/** Hand a template to one person, one group or one email address (apps/api/src/db/goal_templates.py). */
export interface GoalAssignmentRequest {
  user_id?: number | null
  usergroup_id?: number | null
  subject_email?: string | null
  staff_user_ids?: number[]
  collaborators?: Array<{ user_id: number; role_key?: string | null }>
  owner_user_id?: number | null
  welcome_message?: string
  start_date?: string | null
  due_date?: string | null
  schedule?: {
    stages: Array<{ stage_key: string; start_date?: string | null }>
    steps: Array<{ step_key: string; due_date?: string | null }>
  } | null
  /** The badge its learners earn; needed only to pick between badges that share a template. */
  badge_uuid?: string | null
}

/** Another organization's badge template this one is authorized to run, with its assignments of it. */
export interface IssuerBadgeRoute {
  route_uuid: string
  badge: AssignmentBadge
  rule: EligibilityRule
  from_version: number | null
  template: { template_uuid: string; title: string; description: string; thumbnail_image: string | null; published_version: number | null; published_at: string | null }
  assignments: GoalAssignmentSummary[]
}

/** A 409 from saving: someone saved since the editor read the draft. */
export const isStaleTemplateError = (error: any) => error?.status === 409 && typeof error?.detail === 'object' && !!error?.detail?.etag

export const templateKeys = {
  list: (orgId: number, includeArchived = false) => withOrg(templatesUrl(), orgId, includeArchived ? '&include_archived=true' : ''),
  one: (orgId: number, templateUuid: string) => withOrg(templateUrl(templateUuid), orgId),
  assignments: (orgId: number, templateUuid: string) => withOrg(templateUrl(templateUuid, '/assignments'), orgId),
  orgAssignments: (orgId: number) => withOrg(templatesUrl('/assignments'), orgId),
  badgeRoutes: (orgId: number) => withOrg(templatesUrl('/badge-routes'), orgId),
}

export const templatesApi = {
  list: (orgId: number, token?: string, includeArchived = false) => request<GoalTemplate[]>(templateKeys.list(orgId, includeArchived), token),
  get: (orgId: number, templateUuid: string, token?: string) => request<TemplateDetail>(templateKeys.one(orgId, templateUuid), token),
  create: (orgId: number, data: { title?: string; document?: TemplateDocument }, token?: string) => request<TemplateDetail>(withOrg(templatesUrl(), orgId), token, 'POST', data),
  save: (orgId: number, templateUuid: string, document: TemplateDocument, etag: string | null, token?: string) => request<TemplateDetail>(templateKeys.one(orgId, templateUuid), token, 'PUT', { document, etag }),
  publish: (orgId: number, templateUuid: string, note: string, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, '/publish'), orgId), token, 'POST', { note }),
  restore: (orgId: number, templateUuid: string, number: number, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, `/versions/${number}/restore`), orgId), token, 'POST'),
  archive: (orgId: number, templateUuid: string, token?: string) => request<GoalTemplate>(withOrg(templateUrl(templateUuid, '/archive'), orgId), token, 'POST'),
  unarchive: (orgId: number, templateUuid: string, token?: string) => request<GoalTemplate>(withOrg(templateUrl(templateUuid, '/unarchive'), orgId), token, 'POST'),
  updateBadgeVersions: (orgId: number, templateUuid: string, acceptPrevious: boolean, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, '/update-badge-versions'), orgId, `&accept_previous_major_versions=${acceptPrevious}`), token, 'POST'),
  activity: (orgId: number, templateUuid: string, activityUuid: string, token?: string) => request<{ template: { template_uuid: string; title: string; org_id: number }; activity: any }>(withOrg(templateUrl(templateUuid, `/activities/${q(activityUuid)}`), orgId), token),

  library: (orgId: number, query: string, token?: string) => request<LibraryTemplate[]>(withOrg(templatesUrl('/library'), orgId, `&q=${q(query)}`), token),
  copyFromLibrary: (orgId: number, templateUuid: string, token?: string) => request<TemplateDetail>(withOrg(templatesUrl(`/library/${q(templateUuid)}/copy`), orgId), token, 'POST'),
  publishToLibrary: (orgId: number, templateUuid: string, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, '/publish-to-library'), orgId), token, 'POST'),

  assignments: (orgId: number, templateUuid: string, token?: string) => request<GoalAssignmentSummary[]>(templateKeys.assignments(orgId, templateUuid), token),
  orgAssignments: (orgId: number, token?: string) => request<GoalAssignmentSummary[]>(templateKeys.orgAssignments(orgId), token),
  badgeRoutes: (orgId: number, token?: string) => request<IssuerBadgeRoute[]>(templateKeys.badgeRoutes(orgId), token),
  assign: (orgId: number, templateUuid: string, data: GoalAssignmentRequest, token?: string) => request<GoalAssignmentSummary & { goal_uuids: string[] }>(templateKeys.assignments(orgId, templateUuid), token, 'POST', data),
}
