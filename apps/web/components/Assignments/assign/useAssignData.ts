'use client'

import useSWR from 'swr'
import { getAPIUrl } from '@services/config/config'
import { assignmentApi, assignmentKeys, type AssignmentListItem } from '@services/assignments/assignments'
import { templateKeys, templatesApi, type TemplateDetail } from '@services/goals/templates'
import { peopleApi, peopleKeys, type Directory } from '@services/school/people'
import { goalAdminUrl } from '@services/goals/admin'
import { swrFetcher } from '@services/utils/ts/requests'

export interface GroupOption { id: number; name: string; member_count: number; /** A Canvas course's group: it takes plans on every tier. */ canvas_course?: boolean }

const quiet = { revalidateOnFocus: false, keepPreviousData: true }

/** What the assign flow reads: the plan, the organization's groups and people, and its assignments. */
export function useAssignData({ orgId, token, open, templateUuid, query, staffQuery, groups }: {
  /** 'all' lists every group (Full tier); 'courses' only Canvas course groups, which take plans on every tier. */
  orgId: number; token?: string; open: boolean; templateUuid: string; query: string; staffQuery: string; groups: 'all' | 'courses'
}) {
  const on = open && orgId && token
  const template = useSWR<TemplateDetail>(on && templateUuid ? templateKeys.one(orgId, templateUuid) : null, () => templatesApi.get(orgId, templateUuid, token), quiet)
  const assignments = useSWR<AssignmentListItem[]>(on ? assignmentKeys.list(orgId) : null, () => assignmentApi.list(orgId, token), quiet)
  const groupsUrl = groups === 'all' ? `${getAPIUrl()}usergroups/org/${orgId}/overview?org_id=${orgId}` : goalAdminUrl('/course-groups', orgId)
  const groupList = useSWR<GroupOption[]>(on ? groupsUrl : null, (url: string) => swrFetcher(url, token), quiet)
  const people = useSWR<Directory>(on ? peopleKeys.directory(orgId, query.trim()) : null, () => peopleApi.directory(orgId, query.trim(), token), quiet)
  const staff = useSWR<Directory>(on ? peopleKeys.directory(orgId, staffQuery.trim()) : null, () => peopleApi.directory(orgId, staffQuery.trim(), token), quiet)
  return {
    template: template.data,
    templateError: template.error,
    assignments: assignments.data || [],
    refreshAssignments: assignments.mutate,
    groups: groupList.data || [],
    people: (people.data?.people || []).filter((item) => item.role === 'learner' && item.status !== 'alumni'),
    staff: (staff.data?.people || []).filter((item) => item.role === 'admin' || item.role === 'staff'),
  }
}
