import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

const LEGACY_SECTIONS: Record<string, () => string> = {
  users: routePaths.org.dash.users.users,
  usergroups: routePaths.org.dash.users.usergroups,
  roles: routePaths.org.dash.users.roles,
  signups: routePaths.org.dash.users.signups,
  add: routePaths.org.dash.users.add,
  'audit-logs': routePaths.org.dash.users.auditLogs,
}

export default async function LegacyUsersPage({
  params,
}: {
  params: Promise<{ orgslug: string; subpage: string }>
}) {
  const { orgslug, subpage } = await params
  redirect(getUriWithOrg(orgslug, (LEGACY_SECTIONS[subpage] || routePaths.org.dash.users.users)()))
}
