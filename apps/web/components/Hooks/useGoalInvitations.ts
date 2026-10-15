'use client'

import useSWR, { mutate as mutateGlobal } from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { goalsApi, isGoalsKey } from '@services/goals/goals'
import { goalSharingApi, orgInvitationsKey, type OrgGoalInvitation } from '@services/goals/sharing'
import { swrFetcher } from '@services/utils/ts/requests'

export type { OrgGoalInvitation }

/** Goals organizations handed the learner: pending ones to accept or decline, and the active ones they took on. */
export default function useGoalInvitations() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const key = token ? orgInvitationsKey() : null
  const { data, error, isLoading, mutate } = useSWR<OrgGoalInvitation[]>(key, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const goals = Array.isArray(data) ? data : []
  const invitations = goals.filter((item) => item.status === 'pending')

  return {
    goals,
    invitations,
    unreadCount: invitations.filter((item) => item.unread).length,
    error,
    isLoading,
    async markViewed() {
      if (!token || !key) return
      await mutate(async (current = []) => {
        await goalSharingApi.markOrgInvitationsViewed(token)
        return current.map((item) => item.status === 'pending' ? { ...item, unread: false, viewed_at: item.viewed_at || new Date().toISOString() } : item)
      }, { revalidate: false })
    },
    async respond(invitation: OrgGoalInvitation, accept: boolean) {
      if (!token) throw new Error('Authentication required')
      await goalsApi.respond(invitation.goal_uuid, accept, token)
      await Promise.all([mutate(), mutateGlobal(isGoalsKey)])
    },
  }
}
