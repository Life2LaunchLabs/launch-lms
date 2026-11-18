import { NextRequest } from 'next/server'
import { isSubdomainOf, isSameHost, isLocalhost, stripPort } from '@services/utils/ts/hostUtils'
import { getConfig } from '@services/config/config'
import { legacyParentCookieDomain } from '@services/routing/handoff'
import { CANVAS_SESSION_COOKIE, SESSION_COOKIE_NAMES } from '@services/auth/sessionCookies'

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

export function isCanvasSession(request: NextRequest): boolean {
  return request.cookies.get(CANVAS_SESSION_COOKIE)?.value === '1'
}

type CookieOptions = {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'none'
  path: string
  domain?: string
  partitioned?: boolean
}

export function getCookieOptions(request: NextRequest): CookieOptions {
  const isSecure = request.nextUrl.protocol === 'https:'
  const domain = getCookieDomain(request)
  if (isCanvasSession(request)) {
    // Inside Canvas: browsers only send SameSite=None cookies, kept in Canvas's partition. A refresh
    // that dropped back to Lax would sign the student out inside the Canvas page.
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
      ...(domain ? { domain } : {}),
    }
  }
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    ...(domain ? { domain } : {}),
  }
}

/** Attributes for a raw Set-Cookie header (logout clears), matching getCookieOptions. */
export function cookieAttributeSuffix(request: NextRequest, isSecure: boolean): string {
  return isCanvasSession(request)
    ? '; SameSite=None; Secure; Partitioned'
    : `; SameSite=Lax${isSecure ? '; Secure' : ''}`
}

export function getLegacyParentCookieDomain(request: NextRequest): string | undefined {
  if (getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain') !== 'host-only') return undefined
  const configured = getConfig('NEXT_PUBLIC_LAUNCHLMS_LEGACY_COOKIE_DOMAIN')
  if (!configured) return undefined
  return legacyParentCookieDomain(getDomainFromRequest(request).domain, configured)
}

/** A browser request that came from a page on this same host (Origin, else Referer). */
export function isSameOriginRequest(request: NextRequest): boolean {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const origin = request.headers.get('origin') || request.headers.get('referer')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host.split(',')[0].trim()
  } catch {
    return false
  }
}
