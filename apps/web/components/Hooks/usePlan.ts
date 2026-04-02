'use client'
import { useOrg } from '@components/Contexts/OrgContext'
import type { PlanLevel } from '@services/plans/plans'

/**
 * Single source of truth for the current org's effective plan.
 *
 * - Returns 'enterprise' in OSS mode (all features unlocked)
 * - Returns 'enterprise' in EE mode (all features unlocked)
 * - Returns the DB plan in SaaS mode
 */
export function usePlan(): PlanLevel {
  const org = useOrg() as any
  const config = org?.config?.config
  const isV2 = config?.config_version?.startsWith('2')
  const plan = isV2 ? config?.plan : config?.cloud?.plan
  return (plan || 'free') as PlanLevel
}
