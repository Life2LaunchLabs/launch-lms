import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

/** Whether the learner shared this Coach conversation with the coaching team. */
export type ConversationShare = { shared: boolean; shared_at: string | null; note: string }

async function shareRequest(orgId: number, conversationUuid: string, method: string, accessToken: string, data?: unknown): Promise<ConversationShare> {
  const path = `hub/conversations/${encodeURIComponent(conversationUuid)}/share?org_id=${encodeURIComponent(orgId)}`
  const response = await fetch(`${getAPIUrl()}${path}`, RequestBodyWithAuthHeader(method, data ?? null, null, accessToken))
  if (!response.ok) return errorHandling(response)
  return response.json()
}

export const getConversationShare = (orgId: number, conversationUuid: string, accessToken: string) => shareRequest(orgId, conversationUuid, 'GET', accessToken)
export const shareConversation = (orgId: number, conversationUuid: string, note: string, accessToken: string) => shareRequest(orgId, conversationUuid, 'POST', accessToken, { note })
export const unshareConversation = (orgId: number, conversationUuid: string, accessToken: string) => shareRequest(orgId, conversationUuid, 'DELETE', accessToken)
