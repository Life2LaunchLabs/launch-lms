'use client'

import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { connectApi, connectKeys, type ChatCounts, type ChatList } from '@services/connect/connect'

export const LIST_REFRESH_MS = 15_000

export function useConnectToken(): string | undefined {
  const session = useLHSession() as any
  return session?.data?.tokens?.access_token
}

/** Unread chats and waiting requests, for the Connect dot in the nav. */
export function useConnectCounts() {
  const token = useConnectToken()
  const { data } = useSWR<ChatCounts>(token ? connectKeys.counts() : null, () => connectApi.counts(token), { refreshInterval: LIST_REFRESH_MS, revalidateOnFocus: true })
  return { unread: data?.unread || 0, requests: data?.requests || 0 }
}

export function useChatList() {
  const token = useConnectToken()
  const swr = useSWR<ChatList>(token ? connectKeys.chats() : null, () => connectApi.chats(token), { refreshInterval: LIST_REFRESH_MS, revalidateOnFocus: true })
  return { ...swr, token }
}
