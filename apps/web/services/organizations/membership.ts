import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, getResponseMetadata } from '@services/utils/ts/requests'
import type { PersonSummary } from '@services/goals/types'

/** A learner's status with an organization, which the organization sets. Only active learners count toward its limit. */
export type MemberStatus = 'active' | 'alumni'

export const STATUS_LABELS: Record<MemberStatus, string> = { active: 'Active', alumni: 'Alumni' }

/** What an admin lets a staff member do. */
export type StaffPermission = 'build_plans' | 'run_assignments' | 'review_work' | 'manage_learners' | 'see_reports'

/** Each permission's short name; the API's label says what it allows. */
export const PERMISSION_NAMES: Record<StaffPermission, string> = {
  build_plans: 'Build plans', run_assignments: 'Run assignments', review_work: 'Review work', manage_learners: 'Manage learners', see_reports: 'See reports',
}

export interface StaffPermissionInfo { key: StaffPermission; label: string; default: boolean }

export interface Relationship {
  status: MemberStatus
  status_since: string | null
  member_since: string | null
  role: 'staff' | 'learner'
  plans: Array<{ goal_uuid: string; title: string; status: string }>
  staff: PersonSummary[]
}

export const membershipKeys = {
  relationship: (orgId: number) => `${getAPIUrl()}orgs/${orgId}/relationship`,
  staffPermissions: (orgId: number) => `${getAPIUrl()}orgs/${orgId}/staff-permissions`,
}

async function put(url: string, body: unknown, token: string) {
  return getResponseMetadata(await fetch(url, RequestBodyWithAuthHeader('PUT', body, null, token)))
}

export const setMemberStatus = (orgId: number, userId: number, status: MemberStatus, token: string) =>
  put(`${getAPIUrl()}orgs/${orgId}/users/${userId}/status`, { status }, token)

export const setGroupStatus = (orgId: number, groupId: number, status: MemberStatus, token: string) =>
  put(`${getAPIUrl()}orgs/${orgId}/usergroups/${groupId}/status`, { status }, token)

export const setStaffPermissions = (orgId: number, userId: number, permissions: StaffPermission[], token: string) =>
  put(`${getAPIUrl()}orgs/${orgId}/users/${userId}/permissions`, { permissions }, token)

/** "Alumni since June 2026", or "Active". */
export function statusLine(status: MemberStatus, since: string | null): string {
  if (status === 'active' || !since) return STATUS_LABELS[status]
  return `${STATUS_LABELS[status]} since ${new Date(since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
}
