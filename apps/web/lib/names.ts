/**
 * How a person is named on screen. Rosters, reports and official documents use the legal name; everywhere
 * else shows the name someone goes by, set in their portfolio's identity fields (apps/api/src/services/users/names.py).
 */

type Named = { preferred_name?: string | null; first_name?: string | null; last_name?: string | null; username?: string | null } | null | undefined

export function legalName(user: Named): string {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
}

/** The name to show outside rosters and reports. */
export function shownName(user: Named): string {
  return (user?.preferred_name || '').trim() || legalName(user) || user?.username || ''
}
