import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type HubAdvisorMessage = { role: 'user' | 'assistant'; content: string }

export async function askHubAdvisor(
  orgId: number,
  messages: HubAdvisorMessage[],
  accessToken: string
): Promise<{ answer: string; usage: { input_tokens: number; output_tokens: number } }> {
  const response = await fetch(
    `${getAPIUrl()}hub/advisor?org_id=${encodeURIComponent(orgId)}`,
    RequestBodyWithAuthHeader('POST', { messages }, null, accessToken)
  )
  return errorHandling(response)
}
