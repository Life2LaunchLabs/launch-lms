import {
  getConfig, getLAUNCHLMS_DOMAIN_VAL, getLAUNCHLMS_TOP_DOMAIN_VAL,
} from '@services/config/config'
import { isSubdomainOf, isSameHost, isLocalhost } from '@services/utils/ts/hostUtils'

const OAUTH_STATE_COOKIE = 'launchlms_oauth_state'

function isCustomDomain(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  const domain = getLAUNCHLMS_DOMAIN_VAL()
  return !isSubdomainOf(hostname, domain) && !isSameHost(hostname, domain) && !isLocalhost(hostname)
}

export function getCookieAttributes(): { secureAttr: string; domainAttr: string; sameSiteAttr: string } {
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const secureAttr = isSecure ? '; Secure' : ''
  const topDomain = getLAUNCHLMS_TOP_DOMAIN_VAL()
  let domainAttr = ''
  const cookieScope = getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain')
  if (cookieScope !== 'host-only' && !isCustomDomain() && topDomain !== 'localhost') {
    domainAttr = `; domain=.${topDomain}`
  }
  return { secureAttr, domainAttr, sameSiteAttr: '; SameSite=Lax' }
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
