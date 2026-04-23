import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAPIUrl } from './services/config/config'
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './services/auth/cookies'
import { ROUTING_COOKIES } from './services/routing/cookies'
import { isCustomDomainHost, getOrgSlugFromSubdomain } from './services/routing/context'
import {
  resolveRequestRouting,
  type RequestInstanceInfo,
  type RoutingDecision,
} from './services/routing/requestPolicy'
import { stripPort } from './services/utils/ts/hostUtils'

interface OrgSubdomainAccess {
  user_site_enabled: boolean
}

let instanceCache: { data: RequestInstanceInfo; ts: number } | null = null
const orgAccessCache = new Map<string, { data: OrgSubdomainAccess; ts: number }>()
const INSTANCE_CACHE_TTL = 30 * 1000
const ORG_ACCESS_CACHE_TTL = 30 * 1000

function getDevInstanceFallback(): RequestInstanceInfo {
  const frontendDomain =
    process.env.NEXT_PUBLIC_LAUNCHLMS_DOMAIN ||
    (process.env.LAUNCHLMS_DEV_PUBLIC_HOST
      ? `${process.env.LAUNCHLMS_DEV_PUBLIC_HOST}:3000`
      : 'localhost:3000')
  const topDomain =
    process.env.NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN ||
    process.env.LAUNCHLMS_DEV_PUBLIC_HOST ||
    'localhost'

  return {
    multi_org_enabled: true,
    default_org_slug: 'default',
    frontend_domain: frontendDomain,
    top_domain: topDomain,
  }
}

async function getInstanceInfo(): Promise<RequestInstanceInfo> {
  if (instanceCache && Date.now() - instanceCache.ts < INSTANCE_CACHE_TTL) {
    return instanceCache.data
  }

  try {
    const apiUrl = process.env.LAUNCHLMS_INTERNAL_API_URL || getAPIUrl()
    const res = await fetch(`${apiUrl}instance/info`, {
      signal: AbortSignal.timeout(3000),
    })

    if (res.ok) {
      instanceCache = { data: await res.json(), ts: Date.now() }
      return instanceCache.data
    }
  } catch {
    // Backend unavailable - fall back to local defaults.
  }

  return getDevInstanceFallback()
}

function setInstanceCookies(response: NextResponse, info: RequestInstanceInfo) {
  response.cookies.set({
    name: ROUTING_COOKIES.multiOrg,
    value: String(info.multi_org_enabled),
    path: '/',
  })
  response.cookies.set({
    name: ROUTING_COOKIES.defaultOrg,
    value: info.default_org_slug,
    path: '/',
  })
  response.cookies.set({
    name: ROUTING_COOKIES.frontendDomain,
    value: info.frontend_domain,
    path: '/',
  })
  response.cookies.set({
    name: ROUTING_COOKIES.topDomain,
    value: info.top_domain,
    path: '/',
  })

  return response
}

async function resolveCustomDomain(domain: string): Promise<string | null> {
  try {
    const apiUrl = process.env.LAUNCHLMS_INTERNAL_API_URL || getAPIUrl()
    const res = await fetch(
      `${apiUrl}orgs/resolve/domain/${encodeURIComponent(stripPort(domain))}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    )

    if (!res.ok) return null
    const data = await res.json()
    return data.org_slug || null
  } catch (error) {
    console.error('Error resolving custom domain:', error)
    return null
  }
}

async function getOrgSubdomainAccess(orgSlug: string): Promise<OrgSubdomainAccess> {
  const cached = orgAccessCache.get(orgSlug)
  if (cached && Date.now() - cached.ts < ORG_ACCESS_CACHE_TTL) {
    return cached.data
  }

  try {
    const apiUrl = process.env.LAUNCHLMS_INTERNAL_API_URL || getAPIUrl()
    const res = await fetch(`${apiUrl}orgs/slug/${encodeURIComponent(orgSlug)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (res.ok) {
      const data = await res.json()
      const config = data?.config?.config ?? {}
      const resolved = config?.resolved_features?.custom_domains
      const access = {
        user_site_enabled:
          typeof resolved?.enabled === 'boolean'
            ? resolved.enabled
            : config?.cloud?.custom_domain === true,
      }
      orgAccessCache.set(orgSlug, { data: access, ts: Date.now() })
      return access
    }
  } catch (error) {
    console.error('Error resolving org subdomain access:', error)
  }

  return { user_site_enabled: false }
}

function buildResponse(req: NextRequest, decision: RoutingDecision): NextResponse {
  switch (decision.action) {
    case 'next':
      return NextResponse.next()
    case 'redirect':
      return NextResponse.redirect(new URL(decision.destination || '/', req.url))
    case 'rewrite':
    default:
      return NextResponse.rewrite(new URL(decision.destination || '/', req.url))
  }
}

function applyDecision(response: NextResponse, decision: RoutingDecision) {
  decision.cookies?.forEach((cookie) => {
    response.cookies.set(cookie)
  })

  Object.entries(decision.headers || {}).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

function hasSameOriginReferrer(req: NextRequest): boolean {
  const referer = req.headers.get('referer')
  if (!referer) return false

  try {
    return new URL(referer).origin === req.nextUrl.origin
  } catch {
    return false
  }
}

export const config = {
  matcher: [
    '/((?!api|content|_next|fonts|umami|examples|embed|monitoring|[\\w-]+\\.\\w+).*)',
    '/sitemap.xml',
    '/robots.txt',
    '/payments/stripe/connect/oauth',
    '/podcast/:path*/feed',
  ],
}

export default async function proxy(req: NextRequest) {
  const instanceInfo = await getInstanceInfo()
  const pathname = req.nextUrl.pathname
  const search = req.nextUrl.search
  const host = req.headers.get('host')
  const hasSession =
    !!req.cookies.get(ACCESS_TOKEN_COOKIE)?.value ||
    !!req.cookies.get(REFRESH_TOKEN_COOKIE)?.value

  let resolvedCustomDomainOrgSlug: string | null = null
  if (isCustomDomainHost(host, instanceInfo.frontend_domain) && host) {
    resolvedCustomDomainOrgSlug = await resolveCustomDomain(host)
  }

  let orgSubdomainAccess: OrgSubdomainAccess | null = null
  const subdomainOrgSlug = getOrgSlugFromSubdomain(host, instanceInfo.frontend_domain)
  if (
    instanceInfo.multi_org_enabled &&
    subdomainOrgSlug &&
    subdomainOrgSlug !== instanceInfo.default_org_slug &&
    !pathname.startsWith('/dash')
  ) {
    orgSubdomainAccess = await getOrgSubdomainAccess(subdomainOrgSlug)
  }

  const decision = resolveRequestRouting({
    requestUrl: req.url,
    pathname,
    search,
    host,
    hasSession,
    isDirectRootVisit: pathname === '/' && !hasSameOriginReferrer(req),
    instanceInfo,
    resolvedCustomDomainOrgSlug,
    orgSubdomainAccess,
  })

  const response = buildResponse(req, decision)
  setInstanceCookies(response, instanceInfo)
  applyDecision(response, decision)
  return response
}
