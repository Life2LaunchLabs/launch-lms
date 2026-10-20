'use client'
import { useMemo } from 'react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { usePlan } from '@components/Hooks/usePlan'
import { isFeatureAvailable, planMeetsRequirement, type PlanLevel } from '@services/plans/plans'
import {
  adminVisibility,
  featureUnlock,
  visibleAdminTabs,
  type AdminAccess,
  type AdminRequirement,
  type ResolvedFeature,
} from '@/lib/admin/registry'

type RoleRights = Record<string, Record<string, boolean | undefined> | undefined>
type SessionRole = { org?: { id?: number }; role?: { rights?: RoleRights } }

/** Every right the viewer holds in this org, merged across their roles. */
function mergeRights(roles: unknown, orgId?: number): RoleRights {
  const merged: RoleRights = {}
  if (!Array.isArray(roles) || orgId == null) return merged
  for (const membership of roles as SessionRole[]) {
    if (membership.org?.id !== orgId) continue
    for (const [resource, actions] of Object.entries(membership.role?.rights || {})) {
      for (const [action, allowed] of Object.entries(actions || {})) {
        if (allowed === true) merged[resource] = { ...merged[resource], [action]: true }
      }
    }
  }
  return merged
}

/**
 * The one place the web reads what the current org and viewer may use: the org's resolved
 * features (`org.config.config.resolved_features[f].enabled`, which already folds in plan,
 * overrides, packages and admin toggles), its plan and packages, and the viewer's role rights.
 */
export function useFeatures() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const plan = usePlan()
  const roles = session?.data?.roles
  const isSuperadmin = session?.data?.user?.is_superadmin === true
  const config = org?.config?.config

  return useMemo(() => {
    const resolved: Record<string, ResolvedFeature> = config?.resolved_features || {}
    const packages: string[] = config?.packages || []
    const rights = mergeRights(roles, org?.id)
    const planAtLeast = (required: PlanLevel) => planMeetsRequirement(plan, required)
    const has = (feature: string) => isFeatureAvailable(feature) && resolved[feature]?.enabled === true
    const can = (right: string) => {
      if (isSuperadmin) return true
      const [resource, action] = right.split('.')
      return rights[resource]?.[action] === true
    }
    const unlockFor = (feature: string) => isFeatureAvailable(feature) ? featureUnlock(feature, resolved[feature], packages, planAtLeast) : null
    const access: AdminAccess = { planAtLeast, can, has, unlockFor }
    return {
      ...access,
      plan,
      resolved,
      packages,
      rights,
      isSuperadmin,
      visibility: (requires: AdminRequirement) => adminVisibility(requires, access),
      adminTabs: () => visibleAdminTabs(access),
    }
  }, [config, roles, org?.id, plan, isSuperadmin])
}

export type Features = ReturnType<typeof useFeatures>
