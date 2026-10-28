'use client'

import useSWR from 'swr'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import { adminHomeApi, plansSummaryKey, type PlansSummary } from '@services/goals/adminHome'
import { MARKETPLACE_KEY, templateMarketplaceApi } from '@services/learning/marketplace'

/** The Plans tabs' numbers, plus requests from other organizations waiting on an admin. `null` while loading. */
export function usePlansSummary(): (PlansSummary & { requests: number; admin: boolean }) | null {
  const { orgId, token, admin } = useStaff()
  const ready = Boolean(orgId && token)
  const { data } = useSWR(ready ? plansSummaryKey(orgId) : null, () => adminHomeApi.plansSummary(orgId, token))
  const { data: requests } = useSWR(ready && admin ? [MARKETPLACE_KEY, 'summary', orgId, token] : null, () => templateMarketplaceApi.summary(orgId, token), { revalidateOnFocus: true })
  return data ? { ...data, requests: requests?.incoming_requested || 0, admin } : null
}
