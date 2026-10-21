'use client'
import { useMemo } from 'react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { NO_ACCESS, type OrgAccess } from '@services/plans/plans'
import {
  adminVisibility,
  featureUnlock,
  visibleAdminTabs,
  type AdminAccess,
  type AdminRequirement,
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
 * The one place the web reads what the current org and viewer may use: the org's access
 * (`org.config.config.access`, worked out by the API from its tier, partner programs and grants)
 * and the viewer's role rights.
 */
export function useFeatures() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const roles = session?.data?.roles
  const isSuperadmin = session?.data?.user?.is_superadmin === true
  const orgAccess: OrgAccess = org?.config?.config?.access || NO_ACCESS

  return useMemo(() => {
    const rights = mergeRights(roles, org?.id)
    const has = (feature: string) => orgAccess.features[feature]?.enabled === true
    const can = (right: string) => {
      if (isSuperadmin) return true
      const [resource, action] = right.split('.')
      return rights[resource]?.[action] === true
    }
    const unlockFor = (feature: string) => featureUnlock(orgAccess.features[feature])
    const access: AdminAccess = { can, has, unlockFor }
    return {
      ...access,
      tier: orgAccess.tier,
      access: orgAccess,
      /** A counted limit (learners, staff_seats, ...); 0 means unlimited. */
      limit: (name: string) => orgAccess.limits[name] ?? 0,
      rights,
      isSuperadmin,
      visibility: (requires: AdminRequirement) => adminVisibility(requires, access),
      adminTabs: () => visibleAdminTabs(access),
    }
  }, [orgAccess, roles, org?.id, isSuperadmin])
}

export type Features = ReturnType<typeof useFeatures>
