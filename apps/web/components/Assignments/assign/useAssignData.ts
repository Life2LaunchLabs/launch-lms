'use client'

import useSWR from 'swr'
import { getAPIUrl } from '@services/config/config'
import { assignmentApi, assignmentKeys, type AssignmentListItem } from '@services/assignments/assignments'
import { templateKeys, templatesApi, type TemplateDetail } from '@services/goals/templates'
import { peopleApi, peopleKeys, type Directory } from '@services/school/people'
import { swrFetcher } from '@services/utils/ts/requests'

export interface GroupOption { id: number; name: string; member_count: number }

const quiet = { revalidateOnFocus: false, keepPreviousData: true }

/** What the assign flow reads: the plan, the organization's groups and people, and its assignments. */
export function useAssignData({ orgId, token, open, templateUuid, query, staffQuery, groups }: {
  orgId: number; token?: string; open: boolean; templateUuid: string; query: string; staffQuery: string; groups: boolean
}) {
  const on = open && orgId && token
  const template = useSWR<TemplateDetail>(on && templateUuid ? templateKeys.one(orgId, templateUuid) : null, () => templatesApi.get(orgId, templateUuid, token), quiet)
  const assignments = useSWR<AssignmentListItem[]>(on ? assignmentKeys.list(orgId) : null, () => assignmentApi.list(orgId, token), quiet)
  const groupList = useSWR<GroupOption[]>(on && groups ? `${getAPIUrl()}usergroups/org/${orgId}/overview?org_id=${orgId}` : null, (url: string) => swrFetcher(url, token), quiet)
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
