interface DashboardRights extends Record<string, boolean | undefined> {
  action_access?: boolean
}

interface SessionRoleRights {
  dashboard?: DashboardRights
  [resourceType: string]: Record<string, boolean | undefined> | undefined
}

export interface SessionOrgRole {
  org?: {
    id?: number
    org_uuid?: string
  }
  role?: {
    rights?: SessionRoleRights
  }
}

interface SessionLike {
  user?: {
    is_superadmin?: boolean
  } | null
  roles?: unknown
}

interface HasDashboardAccessInput {
  orgId?: number | null
  orgUuid?: string | null
  session: SessionLike | null
}

export function hasDashboardAccessForOrg({
  orgId,
  orgUuid,
  session,
}: HasDashboardAccessInput): boolean {
  if (session?.user?.is_superadmin === true) {
    return true
  }

  if (!Array.isArray(session?.roles)) {
    return false
  }

  return (session.roles as SessionOrgRole[]).some((membership) => {
    const membershipOrg = membership.org
    const matchesOrg =
      (orgId != null && membershipOrg?.id === orgId) ||
      (orgUuid != null && membershipOrg?.org_uuid === orgUuid)

    if (!matchesOrg) {
      return false
    }

    return membership.role?.rights?.dashboard?.action_access === true
  })
}
