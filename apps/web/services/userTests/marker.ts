/** The non-secret cookie that tells the persona banner who is signed in. Written by the server, read in the page. */
export const TEST_PERSONA_COOKIE = 'launchlms_test_persona'

export type TestPersonaMarker = { userId: number; name: string; cohort: string }

const decode = (value: string) => { try { return decodeURIComponent(value) } catch { return value } }

/** Parts are encoded so a name can hold ':'. Next encodes the cookie value again when it sets it. */
export function encodeTestPersonaMarker(marker: TestPersonaMarker): string {
  return [marker.userId, encodeURIComponent(marker.name || ''), encodeURIComponent(marker.cohort || '')].join(':')
}

export function readTestPersonaCookie(cookie: string): TestPersonaMarker | null {
  const raw = cookie.split(/;\s*/).find((part) => part.startsWith(`${TEST_PERSONA_COOKIE}=`))
  if (!raw) return null
  let value = raw.slice(TEST_PERSONA_COOKIE.length + 1).replace(/^"|"$/g, '')
  // Set through Next's cookie API, the whole value arrives encoded once more (':' as %3A).
  if (!value.includes(':')) value = decode(value)
  const [userId, name = '', cohort = ''] = value.split(':')
  const id = Number(userId)
  if (!Number.isInteger(id) || id <= 0) return null
  return { userId: id, name: decode(name), cohort: decode(cohort) }
}
