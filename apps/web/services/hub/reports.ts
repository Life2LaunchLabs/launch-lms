import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type HubReportReason = 'harmful' | 'wrong' | 'unhelpful' | 'other'

/** Reports one of Coach's replies to the coaching team, who see the conversation up to it without the learner's name. */
export async function reportHubMessage(orgId: number, messageUuid: string, reason: HubReportReason, note: string, accessToken: string): Promise<{ report_uuid: string; reported: boolean }> {
  const response = await fetch(`${getAPIUrl()}hub/messages/${encodeURIComponent(messageUuid)}/report?org_id=${encodeURIComponent(orgId)}`,
    RequestBodyWithAuthHeader('POST', { reason, note }, null, accessToken))
  if (!response.ok) return errorHandling(response)
  return response.json()
}
