'use client'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'

/** The built-in Admin and Maintainer roles: the ones the API lets change templates, badges and frameworks. */
const EDITOR_ROLE_IDS = new Set([1, 2])

/**
 * Whether the viewer may create and change this organization's templates and badges (its admins and
 * maintainers, or a superadmin). Other staff see the Plans tabs read-only. `null` while the session loads.
 * Detail pages trust the API instead (`read_only` on a template, `can_edit` on a badge).
 */
export function useCanEditPlans(): boolean | null {
  const session = useLHSession() as { status?: string; data?: { user?: { is_superadmin?: boolean }; roles?: Array<{ org?: { id?: number }; role?: { id?: number } }> } }
  const org = useOrg() as { id?: number } | null
  if (session?.status !== 'authenticated' || !org?.id) return session?.status === 'unauthenticated' ? false : null
  if (session.data?.user?.is_superadmin) return true
  return (session.data?.roles || []).some((item) => Number(item.org?.id) === Number(org.id) && EDITOR_ROLE_IDS.has(Number(item.role?.id)))
}
