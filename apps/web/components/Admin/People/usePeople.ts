'use client'

import React from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { LIST_REFRESH_MS } from '@components/Connect/useConnect'
import { getAPIUrl } from '@services/config/config'
import { getUserGroups } from '@services/usergroups/usergroups'
import { peopleApi, peopleKeys, type Directory, type GroupDetail, type PeopleChats, type PeopleFeed, type PeopleStatusFilter, type Profile, type ThreadKind } from '@services/school/people'

// Role ids the API treats as organization admins (admin and maintainer), as in security/org_auth.py.
const ADMIN_ROLE_IDS = new Set([1, 2])

/** The org, the viewer's token, and whether they're one of its admins (who manage roles, removals and groups). */
export function usePeopleContext() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const membership = (session?.data?.roles || []).find((item: any) => String(item?.org?.id) === String(org?.id))
  const isAdmin = session?.data?.user?.is_superadmin === true || ADMIN_ROLE_IDS.has(Number(membership?.role?.id))
  return { org, orgId: Number(org?.id) || 0, orgslug: org?.slug as string, token, isAdmin, viewerId: Number(session?.data?.user?.id) || 0 }
}

export function usePeopleChats() {
  const { orgId, token } = usePeopleContext()
  return useSWR<PeopleChats>(orgId && token ? peopleKeys.chats(orgId) : null, () => peopleApi.chats(orgId, token), { refreshInterval: LIST_REFRESH_MS, revalidateOnFocus: true })
}

/** People's list: who has something for you on top (refreshed like a chat list), then everyone else A to Z, a page at a time. */
export function usePeopleFeed(query: string, offset = 0, status: PeopleStatusFilter = 'active', kind: ThreadKind = 'all') {
  const { orgId, token } = usePeopleContext()
  return useSWR<PeopleFeed>(orgId && token ? peopleKeys.feed(orgId, query, offset, status, kind) : null, () => peopleApi.feed(orgId, query, token, offset, status, kind),
    { keepPreviousData: true, refreshInterval: offset ? 0 : LIST_REFRESH_MS, revalidateOnFocus: offset === 0 })
}

/** Refresh People's list (every page and search) and the chats behind it, after something about someone changes. */
export function useRefreshPeople() {
  const { orgId } = usePeopleContext()
  const { mutate } = useSWRConfig()
  return React.useCallback(() => {
    if (!orgId) return Promise.resolve()
    const feed = peopleKeys.feed(orgId).split('?')[0]
    return mutate((key) => typeof key === 'string' && (key.startsWith(`${feed}?`) || key === peopleKeys.chats(orgId)))
  }, [mutate, orgId])
}

/** A group's name and people, staff first, for its header. */
export function useGroupDetail(groupId: number) {
  const { orgId, token } = usePeopleContext()
  return useSWR<GroupDetail>(orgId && token ? peopleKeys.group(orgId, groupId) : null, () => peopleApi.group(orgId, groupId, token), { revalidateOnFocus: false, shouldRetryOnError: false })
}

export function useDirectory(query: string, offset = 0) {
  const { orgId, token } = usePeopleContext()
  return useSWR<Directory>(orgId && token ? peopleKeys.directory(orgId, query, offset) : null, () => peopleApi.directory(orgId, query, token, offset), { keepPreviousData: true, revalidateOnFocus: false })
}

export function useProfile(username: string) {
  const { orgId, token } = usePeopleContext()
  return useSWR<Profile>(orgId && token && username ? peopleKeys.profile(orgId, username) : null, () => peopleApi.profile(orgId, username, token), { revalidateOnFocus: false, shouldRetryOnError: false })
}


export type OrgGroup = { id: number; name: string; description?: string }

/** The organization's groups, for admins who run them (the same key the group dialogs refresh). */
export function useOrgGroups(enabled = true) {
  const { orgId, token, isAdmin } = usePeopleContext()
  return useSWR<OrgGroup[]>(orgId && token && isAdmin && enabled ? `${getAPIUrl()}usergroups/org/${orgId}?org_id=${orgId}` : null, async () => {
    const response = await getUserGroups(orgId, token as string)
    if (!response.success) throw new Error(response.data?.detail || 'Groups didn’t load')
    return response.data
  }, { revalidateOnFocus: false })
}
