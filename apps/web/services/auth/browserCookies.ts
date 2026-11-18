import {
  getConfig, getLAUNCHLMS_DOMAIN_VAL, getLAUNCHLMS_TOP_DOMAIN_VAL,
} from '@services/config/config'
import { isSubdomainOf, isSameHost, isLocalhost } from '@services/utils/ts/hostUtils'
import { CANVAS_SESSION_COOKIE } from '@services/auth/sessionCookies'

const OAUTH_STATE_COOKIE = 'launchlms_oauth_state'

function isCustomDomain(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  const domain = getLAUNCHLMS_DOMAIN_VAL()
  return !isSubdomainOf(hostname, domain) && !isSameHost(hostname, domain) && !isLocalhost(hostname)
}

/** True inside a session a Canvas launch started (its marker cookie is readable; see services/auth/sessionCookies.ts). */
export function isCanvasBrowserSession(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((cookie) => cookie.trim() === `${CANVAS_SESSION_COOKIE}=1`)
}

export function getCookieAttributes(): { secureAttr: string; domainAttr: string; sameSiteAttr: string } {
  if (isCanvasBrowserSession()) {
    // Inside Canvas every cookie we write or clear must be SameSite=None; Secure; Partitioned, or the
    // browser drops the write (and a clear without Partitioned leaves the partitioned cookie in place).
    // Clears only add secureAttr, so it carries all three.
    const { domainAttr } = getSharedCookieDomainAttr()
    return { secureAttr: '; Secure; SameSite=None; Partitioned', domainAttr, sameSiteAttr: '' }
  }
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const secureAttr = isSecure ? '; Secure' : ''
  const { domainAttr } = getSharedCookieDomainAttr()
  return { secureAttr, domainAttr, sameSiteAttr: '; SameSite=Lax' }
}

function getSharedCookieDomainAttr(): { domainAttr: string } {
  const topDomain = getLAUNCHLMS_TOP_DOMAIN_VAL()
  const cookieScope = getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain')
  if (cookieScope !== 'host-only' && !isCustomDomain() && topDomain !== 'localhost') {
    return { domainAttr: `; domain=.${topDomain}` }
  }
  return { domainAttr: '' }
}

export function oauthCallbackRequiresBounce(): boolean {
  if (typeof window === 'undefined') return false
  if (isCustomDomain()) return true
  if (getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain') !== 'host-only') return false
  const callbackOrigin = `${window.location.protocol}//${getLAUNCHLMS_DOMAIN_VAL()}`
  return window.location.origin !== callbackOrigin
}

export function setOAuthStateCookie(csrf: string): void {
  const { secureAttr, domainAttr, sameSiteAttr } = getCookieAttributes()
  const expires = new Date(Date.now() + 5 * 60 * 1000).toUTCString()
  const value = JSON.stringify({ csrf, timestamp: Date.now() })
  document.cookie = `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; path=/${sameSiteAttr}${secureAttr}${domainAttr}; expires=${expires}`
}

export function getOAuthStateCookie(): { csrf: string; timestamp: number } | null {
  try {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.trim().split('=')
      if (name === OAUTH_STATE_COOKIE) {
        return JSON.parse(decodeURIComponent(rest.join('=')))
      }
    }
  } catch {
    return null
  }
  return null
}

export function clearOAuthStateCookie(): void {
  const { secureAttr, domainAttr, sameSiteAttr } = getCookieAttributes()
  document.cookie = `${OAUTH_STATE_COOKIE}=; path=/${sameSiteAttr}${secureAttr}${domainAttr}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}
