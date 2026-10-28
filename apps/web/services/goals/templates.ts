import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { GoalIcon, GoalTemplate, PlanCover, StepTypeKey, TemplateDocument } from './types'
import type { Achievement, BadgeSummary } from '@services/badges/badges'
import type { AssignmentVersionStatus } from './versions'

const q = encodeURIComponent

const templatesUrl = (path = '') => `${getAPIUrl()}goal-templates${path}`
export const templateUrl = (templateUuid: string, path = '') => templatesUrl(`/${q(templateUuid)}${path}`)
const withOrg = (url: string, orgId: number, extra = '') => `${url}${url.includes('?') ? '&' : '?'}org_id=${orgId}${extra}`

// Any SWR key under /goal-templates, for revalidating after a change.
export const isTemplatesKey = (key: unknown) => typeof key === 'string' && key.startsWith(templatesUrl())

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** One template as the editor reads it: the draft document, its etag, versions and library status. */
export interface TemplateDetail extends GoalTemplate {
  document: TemplateDocument
  published_to_library?: boolean
  library_published_at?: string | null
  source_template_uuid?: string | null
  /**
   * Not editable by this viewer: another organization's template this one runs (its published version),
   * or the organization's own template seen by staff who aren't admins.
   */
  read_only?: boolean
  /** The badge the draft earns, with the plan's details filled in (null: no badge). */
  badge?: Achievement | null
  /** Who made it, on another organization's template. */
  owner_org?: { id: number; name: string; slug: string } | null
  collections?: Array<{ collection_uuid: string; name: string }>
}

/** One row of the organization's template list: its size, badges and the frameworks its steps map to. */
export interface TemplateListItem extends GoalTemplate {
  read_only?: boolean
  stage_count?: number
  step_count?: number
  /** The badge the live version earns. */
  badge?: BadgeSummary | null
  frameworks?: Array<{ framework_uuid: string; name: string; node_count: number }>
  /** The organization's collections it's in. */
  collections?: Array<{ collection_uuid: string; name: string }>
  /** Another organization's plan asked for from Discover, waiting on its creator. */
  requested?: boolean
  /** Shared in Discover (listed, with a live version). */
  listed?: boolean
}

/** A starter plan in the New plan picker: the platform's, copied into the organization when picked. */
export interface PlanStarter extends PlanCover {
  template_uuid: string
  title: string
  description: string
  stage_count: number
  step_count: number
  types: StepTypeKey[]
  preview: Array<{ type: StepTypeKey; title: string }>
  earns_badge: boolean
  /** The starter categories (collection uuids) it's in. */
  categories: string[]
}

export interface PlanStarters { categories: Array<{ collection_uuid: string; name: string; count: number }>; starters: PlanStarter[] }

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
    steps: Array<{ step_key: string; start_date?: string | null; due_date?: string | null; open_early?: boolean; allow_late?: boolean }>
  } | null
}

/** What a draft changes against the version it started from (apps/api/src/services/goals/drafts.py). */
export interface DraftChanges {
  base: { version_uuid: string; semver: string | null } | null
  stages: Array<{ stage_key: string; title: string; change: 'added' | 'removed' | 'changed' | 'same'; fields: string[]; steps: Array<{ step_key: string; title: string; type: string; change: 'added' | 'removed' | 'changed' | 'moved' }> }>
  summary: { added: number; changed: number; removed: number; stages_changed: number }
}

/** How many active assignments and open plans moved when the live version changed. */
export interface MovedAssignments { assignments: number; plans: number; rewritten: number; added: number; removed: number; kept_started: number }

/** A 409 from saving: someone saved since the editor read the draft. */
export const isStaleTemplateError = (error: any) => error?.status === 409 && typeof error?.detail === 'object' && !!error?.detail?.etag

export const templateKeys = {
  list: (orgId: number, includeArchived = false) => withOrg(templatesUrl(), orgId, includeArchived ? '&include_archived=true' : ''),
  one: (orgId: number, templateUuid: string) => withOrg(templateUrl(templateUuid), orgId),
  assignments: (orgId: number, templateUuid: string) => withOrg(templateUrl(templateUuid, '/assignments'), orgId),
  orgAssignments: (orgId: number) => withOrg(templatesUrl('/assignments'), orgId),
  starters: (orgId: number) => withOrg(templatesUrl('/starters'), orgId),
}

export const templatesApi = {
  list: (orgId: number, token?: string, includeArchived = false) => request<TemplateListItem[]>(templateKeys.list(orgId, includeArchived), token),
  get: (orgId: number, templateUuid: string, token?: string) => request<TemplateDetail>(templateKeys.one(orgId, templateUuid), token),
  create: (orgId: number, data: { title?: string; document?: TemplateDocument; icon?: GoalIcon; color?: string }, token?: string) => request<TemplateDetail>(withOrg(templatesUrl(), orgId), token, 'POST', data),
  save: (orgId: number, templateUuid: string, document: TemplateDocument, etag: string | null, token?: string) => request<TemplateDetail>(templateKeys.one(orgId, templateUuid), token, 'PUT', { document, etag }),
  publish: (orgId: number, templateUuid: string, data: { note?: string; semver?: string; make_live?: boolean }, token?: string) => request<TemplateDetail & { moved: MovedAssignments | null }>(withOrg(templateUrl(templateUuid, '/publish'), orgId), token, 'POST', data),
  startDraft: (orgId: number, templateUuid: string, data: { semver: string; note?: string }, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, '/draft'), orgId), token, 'POST', data),
  updateDraft: (orgId: number, templateUuid: string, data: { semver?: string; note?: string }, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, '/draft'), orgId), token, 'PATCH', data),
  discardDraft: (orgId: number, templateUuid: string, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, '/draft'), orgId), token, 'DELETE'),
  draftChanges: (orgId: number, templateUuid: string, token?: string) => request<DraftChanges>(withOrg(templateUrl(templateUuid, '/draft/changes'), orgId), token),
  livePreview: (orgId: number, templateUuid: string, token?: string) => request<{ assignments: number; open_plans: number }>(withOrg(templateUrl(templateUuid, '/live'), orgId), token),
  setLive: (orgId: number, templateUuid: string, versionUuid: string | null, token?: string) => request<TemplateDetail & { moved: MovedAssignments | null }>(withOrg(templateUrl(templateUuid, '/live'), orgId), token, 'PUT', { version_uuid: versionUuid }),
  restore: (orgId: number, templateUuid: string, number: number, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, `/versions/${number}/restore`), orgId), token, 'POST'),
  archive: (orgId: number, templateUuid: string, token?: string) => request<GoalTemplate>(withOrg(templateUrl(templateUuid, '/archive'), orgId), token, 'POST'),
  unarchive: (orgId: number, templateUuid: string, token?: string) => request<GoalTemplate>(withOrg(templateUrl(templateUuid, '/unarchive'), orgId), token, 'POST'),
  activity: (orgId: number, templateUuid: string, activityUuid: string, token?: string) => request<{ template: { template_uuid: string; title: string; org_id: number }; activity: any }>(withOrg(templateUrl(templateUuid, `/activities/${q(activityUuid)}`), orgId), token),

  setCover: (orgId: number, templateUuid: string, data: { icon?: GoalIcon | null; color?: string | null; thumbnail_image?: string }, token?: string) => request<PlanCover>(withOrg(templateUrl(templateUuid, '/cover'), orgId), token, 'PUT', data),
  starters: (orgId: number, token?: string) => request<PlanStarters>(templateKeys.starters(orgId), token),
  useStarter: (orgId: number, templateUuid: string, token?: string) => request<TemplateDetail>(withOrg(templatesUrl(`/starters/${q(templateUuid)}/use`), orgId), token, 'POST'),

  publishToLibrary: (orgId: number, templateUuid: string, token?: string) => request<TemplateDetail>(withOrg(templateUrl(templateUuid, '/publish-to-library'), orgId), token, 'POST'),

  assignments: (orgId: number, templateUuid: string, token?: string) => request<GoalAssignmentSummary[]>(templateKeys.assignments(orgId, templateUuid), token),
  orgAssignments: (orgId: number, token?: string) => request<GoalAssignmentSummary[]>(templateKeys.orgAssignments(orgId), token),
  assign: (orgId: number, templateUuid: string, data: GoalAssignmentRequest, token?: string) => request<GoalAssignmentSummary & { goal_uuids: string[] }>(templateKeys.assignments(orgId, templateUuid), token, 'POST', data),
}
