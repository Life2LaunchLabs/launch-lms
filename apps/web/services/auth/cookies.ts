import { NextRequest } from 'next/server'
import { isSubdomainOf, isSameHost, isLocalhost, stripPort } from '@services/utils/ts/hostUtils'
import { getConfig } from '@services/config/config'
import { legacyParentCookieDomain } from '@services/routing/handoff'
import { SESSION_COOKIE_NAMES } from '@services/auth/sessionCookies'

export const ACCESS_TOKEN_COOKIE = SESSION_COOKIE_NAMES.accessToken
export const REFRESH_TOKEN_COOKIE = SESSION_COOKIE_NAMES.refreshToken
export const ACCESS_TOKEN_MAX_AGE = 8 * 60 * 60 // 8 hours
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export function getDomainFromRequest(request: NextRequest): { domain: string; topDomain: string } {
  const envDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  const envTopDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN')
  if (envDomain) {
    return {
      domain: envDomain,
      topDomain: stripPort(envTopDomain || envDomain),
    }
  }

  const cookieDomain = request.cookies.get('launchlms_frontend_domain')?.value
  const cookieTopDomain = request.cookies.get('launchlms_top_domain')?.value
  if (cookieDomain) {
    return {
      domain: cookieDomain,
      topDomain: stripPort(cookieTopDomain || cookieDomain),
    }
  }

  return { domain: 'localhost', topDomain: 'localhost' }
}

export function getCookieDomain(request: NextRequest): string | undefined {
  if (getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain') === 'host-only') {
    return undefined
  }
  const host = request.headers.get('host')
  const { domain, topDomain } = getDomainFromRequest(request)

  if (isLocalhost(host)) return undefined
  if (topDomain === 'localhost') return undefined
  if (isSubdomainOf(host, domain) || isSameHost(host, domain)) {
    return `.${topDomain}`
  }
  return undefined
}

export function getCookieOptions(request: NextRequest) {
  const isSecure = request.nextUrl.protocol === 'https:'
  const domain = getCookieDomain(request)
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
    ...(domain ? { domain } : {}),
  }
}

export function getLegacyParentCookieDomain(request: NextRequest): string | undefined {
  if (getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain') !== 'host-only') return undefined
  const configured = getConfig('NEXT_PUBLIC_LAUNCHLMS_LEGACY_COOKIE_DOMAIN')
  if (!configured) return undefined
  return legacyParentCookieDomain(getDomainFromRequest(request).domain, configured)
}
