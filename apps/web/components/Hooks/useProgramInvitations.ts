'use client'

import useSWR, { mutate as mutateGlobal } from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import { programsApi } from '@services/programs/programs'
import { RequestBodyWithAuthHeader, errorHandling, swrFetcher } from '@services/utils/ts/requests'

export type ProgramInvitation = {
  participant_uuid: string
  org_id: number
  status: 'invited' | 'active'
  unread: boolean
  viewed_at?: string | null
  created_at: string
  organization: { id: number; org_uuid: string; name: string; slug: string; logo_image?: string | null }
  program: { program_uuid: string; slug: string; name: string; description?: string | null; thumbnail_image?: string | null }
  group?: { id: number; name: string } | null
  assignment: { assignment_uuid: string; welcome_message?: string; initiate_date?: string | null; start_date?: string | null; due_date?: string | null; active: boolean }
}

export const myProgramSummariesKey = () => `${getAPIUrl()}programs/me/all`

export default function useProgramInvitations() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const key = token ? myProgramSummariesKey() : null
  const { data, error, isLoading, mutate } = useSWR<ProgramInvitation[]>(key, (url) => swrFetcher(url, token), { revalidateOnFocus: true })
  const programs = Array.isArray(data) ? data : []
  const invitations = programs.filter((item) => item.status === 'invited')

  return {
    programs,
    invitations,
    unreadCount: invitations.filter((item) => item.unread).length,
    error,
    isLoading,
    async markViewed() {
      if (!token || !key) return
      await mutate(async (current = []) => {
        const response = await fetch(`${getAPIUrl()}programs/invitations/me/viewed`, RequestBodyWithAuthHeader('POST', {}, null, token))
        await errorHandling(response)
        return current.map((item) => item.status === 'invited' ? { ...item, unread: false, viewed_at: item.viewed_at || new Date().toISOString() } : item)
      }, { revalidate: false })
    },
    async respond(invitation: ProgramInvitation, accept: boolean) {
      if (!token) throw new Error('Authentication required')
      await programsApi.respond(invitation.org_id, invitation.participant_uuid, accept, token)
      await Promise.all([
        mutate(),
        mutateGlobal((cacheKey) => typeof cacheKey === 'string' && cacheKey.includes(`${getAPIUrl()}programs`)),
      ])
    },
  }
}
