'use client'

import useSWR from 'swr'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import { MARKETPLACE_KEY, templateMarketplaceApi } from '@services/learning/marketplace'
import type { PlansTabId } from '@/lib/admin/plansTabs'

export type PlansTabCounts = Partial<Record<PlansTabId, { count: number; label: string } | null>>

/** The Marketplace count: requests to use the org's templates and badges waiting on an admin (badges and templates). */
export function marketplaceCount(incoming: number | null | undefined): PlansTabCounts['marketplace'] {
  if (!incoming) return null
  return { count: incoming, label: `${incoming} request${incoming === 1 ? '' : 's'} waiting` }
}

/** Numbers shown on the Plans tabs on every Plans page. Only admins load the marketplace requests summary. */
export function usePlansTabCounts(): PlansTabCounts {
  const { orgId, token, admin } = useStaff()
  const { data } = useSWR(admin && orgId && token ? [MARKETPLACE_KEY, 'summary', orgId, token] : null, () => templateMarketplaceApi.summary(orgId, token), { revalidateOnFocus: true })
  return { marketplace: marketplaceCount(data?.incoming_requested) }
}
