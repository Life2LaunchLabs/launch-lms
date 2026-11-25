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

// Words people put before a family name ("Ms. Rivera", "Coach Diaz"). A greeting keeps them with the name (DEV-204).
const TITLES = new Set(['mr', 'mrs', 'ms', 'mx', 'miss', 'dr', 'prof', 'coach', 'rev', 'fr', 'sr', 'sra', 'srta', 'sir', 'madam'])

/** The short form of a name for greetings and "Sam's portfolio": its first word, unless the name starts with a
 * title, which is kept with the rest ("Ms. Rivera", not "Ms."). A bare title borrows the last name. */
export function firstNameOf(name?: string | null, lastName?: string | null): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  if (TITLES.has(words[0].replace(/\.$/, '').toLowerCase())) {
    return words.length > 1 ? words.join(' ') : [words[0], (lastName || '').trim()].filter(Boolean).join(' ')
  }
  return words[0]
}

/** The name to greet someone by: the name they go by, else their legal first name (see firstNameOf). */
export function greetingName(user: Named): string {
  const preferred = (user?.preferred_name || '').trim()
  return preferred ? firstNameOf(preferred) : firstNameOf(user?.first_name, user?.last_name)
}

type Listed = { name?: string | null; legal_name?: string | null } | null | undefined

/** Staff rosters (Threads, profiles) lead with the legal name; the API adds it only when someone goes by another (PO-3). */
export function rosterName(person: Listed): string {
  return person?.legal_name || person?.name || ''
}

/** The name someone goes by, when it isn't their legal name: shown under the legal name on staff rosters. */
export function goesBy(person: Listed): string {
  return person?.legal_name && person?.name ? person.name : ''
}
