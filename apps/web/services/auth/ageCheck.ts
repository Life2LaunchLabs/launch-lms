import { getCookieAttributes } from '@services/auth/browserCookies'

/**
 * The date-of-birth check before any account is created (DEV-38): no accounts for anyone under 13.
 * The API checks it again on every way to create an account; this only spares a refused request.
 *
 * Neutral age screen: the question doesn't say what age is needed, and once someone is refused they
 * can't try a different date in the same browser session (the refusal is kept in sessionStorage and a
 * session cookie, so other tabs and the organization's own address see it too).
 */

export const MINIMUM_AGE = 13
const BIRTH_KEY = 'launchlms_birth_date'
const REFUSED = 'launchlms_age_refused'
/** Carries the date to the Google callback, which may open on the main address. */
export const OAUTH_BIRTH_COOKIE = 'launchlms_oauth_birth_date'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Whole years old on `today`, or null for something that isn't a real date of birth. */
export function ageOn(birthDate: string, today: Date = new Date()): number | null {
  if (!ISO_DATE.test(birthDate)) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  const born = new Date(Date.UTC(year, month - 1, day))
  if (born.getUTCMonth() !== month - 1 || born.getUTCDate() !== day || year < 1900) return null
  const y = today.getFullYear(), m = today.getMonth() + 1, d = today.getDate()
  if (year > y || (year === y && (month > m || (month === m && day > d)))) return null
  return y - year - (m < month || (m === month && d < day) ? 1 : 0)
}

export type AgeCheckResult = 'ok' | 'required' | 'invalid' | 'refused'

export function checkBirthDate(birthDate: string, today: Date = new Date()): AgeCheckResult {
  if (!birthDate) return 'required'
  const age = ageOn(birthDate, today)
  if (age === null) return 'invalid'
  return age < MINIMUM_AGE ? 'refused' : 'ok'
}

function cookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const found = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null
}

function setCookie(name: string, value: string, expire = false) {
  const { secureAttr, domainAttr, sameSiteAttr } = getCookieAttributes()
  const expires = expire ? '; expires=Thu, 01 Jan 1970 00:00:00 GMT' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/${sameSiteAttr}${secureAttr}${domainAttr}${expires}`
}

function session(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

export function wasRefused(): boolean {
  return session()?.getItem(REFUSED) === '1' || cookie(REFUSED) === '1'
}

/** Someone said they are under 13: keep refusing for the rest of the browser session. */
export function markRefused() {
  session()?.setItem(REFUSED, '1')
  session()?.removeItem(BIRTH_KEY)
  try { setCookie(REFUSED, '1') } catch { /* cookies blocked: sessionStorage still holds it */ }
}

/** Kept only for this tab's sign-up (the welcome step sends it), never stored by the server. */
export function rememberBirthDate(birthDate: string) {
  session()?.setItem(BIRTH_KEY, birthDate)
}

export function rememberedBirthDate(): string | null {
  return wasRefused() ? null : session()?.getItem(BIRTH_KEY) || null
}

export function forgetBirthDate() {
  session()?.removeItem(BIRTH_KEY)
}

/** Before Google's sign-in: the callback page sends it with a new account. */
export function setOAuthBirthDate(birthDate: string) {
  setCookie(OAUTH_BIRTH_COOKIE, birthDate)
}

/** The date for a Google sign-in, read once and cleared. */
export function takeOAuthBirthDate(): string | null {
  const value = cookie(OAUTH_BIRTH_COOKIE)
  if (value !== null) {
    try { setCookie(OAUTH_BIRTH_COOKIE, '', true) } catch { /* nothing to clear */ }
  }
  return value && ISO_DATE.test(value) ? value : null
}

/** The API's answer when it refused to create an account for an age reason. */
export function ageRefusalCode(body: unknown): 'under_13' | 'birth_date_required' | 'birth_date_invalid' | null {
  const code = (body as any)?.detail?.code
  return code === 'under_13' || code === 'birth_date_required' || code === 'birth_date_invalid' ? code : null
}
