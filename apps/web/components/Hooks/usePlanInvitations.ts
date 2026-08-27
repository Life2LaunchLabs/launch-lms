'use client'

import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'

export default function usePlanInvitations() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data } = useSWR<any[]>(token ? `${getAPIUrl()}planning/invitations/me` : null, (url) => swrFetcher(url, token), { revalidateOnFocus: true })
  const invitations = Array.isArray(data) ? data : []
  return { invitations, unreadCount: invitations.filter((item) => item.unread).length }
}
