'use client'

import useSWR, { mutate as mutateGlobal } from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import {
  markOrganizationInvitationsViewed,
  OrganizationInvitation,
  respondToOrganizationInvitation,
} from '@services/organizations/orgs'
import { swrFetcher } from '@services/utils/ts/requests'

export const organizationInvitationsKey = () => `${getAPIUrl()}orgs/invitations/me`

export default function useOrganizationInvitations() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const key = token ? organizationInvitationsKey() : null
  const { data, error, isLoading, mutate } = useSWR<OrganizationInvitation[]>(
    key,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: true }
  )
  const invitations = Array.isArray(data) ? data : []

  return {
    invitations,
    unreadCount: invitations.filter((invitation) => invitation.unread).length,
    error,
    isLoading,
    async markViewed() {
      if (!token || !key) return
      await mutate(
        async (current = []) => {
          await markOrganizationInvitationsViewed(token)
          return current.map((invitation) => ({ ...invitation, unread: false, viewed_at: invitation.viewed_at || new Date().toISOString() }))
        },
        { revalidate: false }
      )
    },
    async respond(invitationUuid: string, accept: boolean) {
      if (!token) throw new Error('Authentication required')
      const response = await respondToOrganizationInvitation(invitationUuid, accept, token)
      if (response.status >= 400) {
        throw new Error(response.data?.detail || 'Could not update the invitation')
      }
      await Promise.all([
        mutate(),
        mutateGlobal((cacheKey) => typeof cacheKey === 'string' && cacheKey.includes('/orgs/discover')),
        accept ? session.update(true) : Promise.resolve(),
      ])
    },
  }
}
