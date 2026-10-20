'use client'

import type { PlansTabId } from '@/lib/admin/plansTabs'

export type PlansTabCounts = Partial<Record<PlansTabId, { count: number; label: string } | null>>

/**
 * Numbers shown on the Plans tabs on every Plans page, such as the marketplace requests waiting
 * on an admin. Nothing is counted yet: the Marketplace tab's requests summary fills this in.
 */
export function usePlansTabCounts(): PlansTabCounts {
  return {}
}
