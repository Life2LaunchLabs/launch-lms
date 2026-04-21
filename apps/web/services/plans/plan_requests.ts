import { getAPIUrl } from '@services/config/config'

export type PlanRequestType = 'plan_upgrade' | 'package_add'
export type PlanRequestStatus = 'pending' | 'approved' | 'denied'

export interface PlanRequest {
  id: number
  org_id: number
  request_uuid: string
  request_type: PlanRequestType
  requested_value: string
  status: PlanRequestStatus
  message: string | null
  creation_date: string
  update_date: string
}

export async function submitPlanRequest(
  orgSlug: string,
  requestType: PlanRequestType,
  requestedValue: string,
  message: string | null,
  accessToken: string
): Promise<PlanRequest> {
  const res = await fetch(`${getAPIUrl()}orgs/${orgSlug}/plan-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      request_type: requestType,
      requested_value: requestedValue,
      message,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.detail || 'Failed to submit request')
  }
  return res.json()
}

export async function getOrgPlanRequests(
  orgSlug: string,
  accessToken: string
): Promise<PlanRequest[]> {
  const res = await fetch(`${getAPIUrl()}orgs/${orgSlug}/plan-requests`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  return res.json()
}
