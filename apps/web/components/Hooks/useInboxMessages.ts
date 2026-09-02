'use client'

import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import { InboxMessage, messagesApi } from '@services/messages/messages'
import { swrFetcher } from '@services/utils/ts/requests'

export const inboxMessagesKey = () => `${getAPIUrl()}messages/me`

export default function useInboxMessages() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const key = token ? inboxMessagesKey() : null
  const { data, error, isLoading, mutate } = useSWR<InboxMessage[]>(
    key,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: true }
  )
  const messages = Array.isArray(data) ? data : []

  return {
    messages,
    unreadCount: messages.filter((message) => message.unread).length,
    error,
    isLoading,
    async markViewed() {
      if (!token || !key) return
      await mutate(async (current = []) => {
        await messagesApi.markViewed(token)
        return current.map((message) => ({
          ...message,
          unread: false,
          read_at: message.read_at || new Date().toISOString(),
        }))
      }, { revalidate: false })
    },
    async respond(messageUuid: string, accept: boolean) {
      if (!token) throw new Error('Authentication required')
      await messagesApi.respond(messageUuid, accept, token)
      await mutate()
    },
  }
}
