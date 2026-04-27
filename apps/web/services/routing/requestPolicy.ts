import { ROUTING_COOKIES } from './cookies.ts'
import {
  buildMainDomainUrl,
  resolveOrgHostContext,
} from './context.ts'

export interface RequestInstanceInfo {
  multi_org_enabled: boolean
  default_org_slug: string
  frontend_domain: string
  top_domain: string
}

export interface RequestRoutingCookie {
  name: string
  value: string
  path: string
  domain?: string
}

export interface RoutingDecision {
  action: 'next' | 'rewrite' | 'redirect'
  destination?: string
  cookies?: RequestRoutingCookie[]
  headers?: Record<string, string>
}

export interface ResolveRequestRoutingInput {
  requestUrl: string
  pathname: string
  search: string
  host: string | null
  hasSession: boolean
  instanceInfo: RequestInstanceInfo
  resolvedCustomDomainOrgSlug?: string | null
  orgSubdomainAccess?: { user_site_enabled: boolean } | null
}

const STANDARD_PATHS = new Set(['/home'])
const AUTH_PATHS = new Set(['/login', '/signup', '/reset', '/forgot', '/verify-email'])
const AUTH_CALLBACK_PREFIXES = ['/auth/sso/', '/auth/callback/', '/auth/token-exchange']
const PUBLIC_COURSE_PATH_RE = /^\/course\/[^/]+(\/activity\/[^/]+)?$/
const PODCAST_FEED_RE = /^\/podcast\/([^/]+)\/feed$/
const EDITOR_ACTIVITY_RE = /^\/course\/[^/]+\/activity\/[^/]+\/edit$/

function getAdminMigrationPath(pathname: string): string {
  if (pathname === '/login') return '/login'
  if (pathname === '/' || pathname === '') return '/dash/org-management'
  if (pathname === '/organizations') return '/dash/org-management'
  if (pathname.startsWith('/organizations/')) {
    const orgId = pathname.split('/')[2]
    return `/dash/org-management/${orgId}`
  }
  if (pathname === '/users') return '/dash/org-management/users'
  if (pathname === '/analytics') return '/dash/org-management/analytics'
  return '/dash/org-management'
}

export function resolveRequestRouting(
  input: ResolveRequestRoutingInput
): RoutingDecision {
  const { instanceInfo, pathname, search } = input
  const context = resolveOrgHostContext({
    host: input.host,
    frontendDomain: instanceInfo.frontend_domain,
    defaultOrgSlug: instanceInfo.default_org_slug,
    resolvedCustomDomainOrgSlug: input.resolvedCustomDomainOrgSlug,
    subdomainAllowed: input.orgSubdomainAccess?.user_site_enabled ?? true,
  })
  const hostingMode = instanceInfo.multi_org_enabled ? 'multi' : 'single'

  const isAdminSubdomain =
    context.bareHost.startsWith('admin.') ||
    (context.subdomainOrgSlug === null &&
      context.bareHost !== '' &&
      context.bareHost.endsWith(`.${context.bareFrontendDomain}`) &&
      context.bareHost.slice(0, context.bareHost.length - (`.${context.bareFrontendDomain}`).length) === 'admin')

  if (isAdminSubdomain) {
    return {
      action: 'redirect',
      destination: buildMainDomainUrl(
        input.requestUrl,
        getAdminMigrationPath(pathname),
        search,
        instanceInfo.frontend_domain
      ),
    }
  }

  if (STANDARD_PATHS.has(pathname)) {
    return {
      action: 'rewrite',
      destination: `${pathname}${search}`,
    }
  }

  if (AUTH_PATHS.has(pathname)) {
    const cookies: RequestRoutingCookie[] = []
    const headers: Record<string, string> = {}

    if (context.hostMode === 'custom' && input.host) {
      cookies.push({
        name: ROUTING_COOKIES.customDomain,
        value: input.host,
        path: '/',
      })
      headers['x-custom-domain'] = input.host
    }

    return {
      action: 'rewrite',
      destination: `/auth${pathname}${search}`,
      cookies,
      headers,
    }
  }

  if (AUTH_CALLBACK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return {
      action: 'rewrite',
      destination: `${pathname}${search}`,
    }
  }

  if (EDITOR_ACTIVITY_RE.test(pathname)) {
    return {
      action: 'rewrite',
      destination: `/editor${pathname}`,
    }
  }

  if (pathname.startsWith('/board/') || pathname.startsWith('/editor/playground/')) {
    return {
      action: 'rewrite',
      destination: `${pathname}${search}`,
    }
  }

  if (pathname.startsWith('/payments/stripe/connect/oauth')) {
    const searchParams = new URLSearchParams(search)
    const orgSlug = searchParams.get('state')?.split('_')[0]
    const redirectParams = new URLSearchParams(search)

    if (orgSlug) {
      redirectParams.set('orgslug', orgSlug)
    }

    return {
      action: 'rewrite',
      destination: `/payments/stripe/connect/oauth${redirectParams.toString() ? `?${redirectParams.toString()}` : ''}`,
    }
  }

  if (pathname.startsWith('/health')) {
    return {
      action: 'rewrite',
      destination: '/api/health',
    }
  }

  if (
    hostingMode === 'multi' &&
    context.subdomainOrgSlug &&
    context.subdomainOrgSlug !== instanceInfo.default_org_slug &&
    !pathname.startsWith('/dash') &&
    !context.subdomainAllowed
  ) {
    return {
      action: 'redirect',
      destination: buildMainDomainUrl(
        input.requestUrl,
        pathname,
        search,
        instanceInfo.frontend_domain
      ),
    }
  }

  if (pathname.startsWith('/orgs/')) {
    return {
      action: 'next',
    }
  }

  if (pathname === '/redirect_from_auth') {
    return {
      action: 'rewrite',
      destination: `/auth/redirect${search}`,
    }
  }

  if (PODCAST_FEED_RE.test(pathname)) {
    return {
      action: 'rewrite',
      destination: `/api${pathname}`,
      headers: {
        'X-Feed-Orgslug': context.resolvedOrgSlug,
      },
    }
  }

  if (pathname.startsWith('/sitemap.xml')) {
    return {
      action: 'rewrite',
      destination: '/api/sitemap',
      headers: {
        'X-Sitemap-Orgslug': context.resolvedOrgSlug,
      },
    }
  }

  if (pathname === '/robots.txt') {
    return {
      action: 'rewrite',
      destination: '/api/robots',
      headers: {
        'X-Robots-Orgslug': context.resolvedOrgSlug,
      },
    }
  }

  if (!input.hasSession) {
    const isGuestPath =
      pathname === '/welcome' ||
      pathname.startsWith('/welcome/') ||
      pathname === '/quickstart' ||
      pathname.startsWith('/quickstart/')
    const isPublicCoursePath = PUBLIC_COURSE_PATH_RE.test(pathname)

    if (!isGuestPath && !isPublicCoursePath) {
      return {
        action: 'redirect',
        destination: new URL('/welcome', input.requestUrl).toString(),
      }
    }
  }

  if (context.hostMode === 'custom' && input.resolvedCustomDomainOrgSlug) {
    return {
      action: 'rewrite',
      destination: `/orgs/${input.resolvedCustomDomainOrgSlug}${pathname}`,
      cookies: [
        {
          name: ROUTING_COOKIES.customDomain,
          value: input.host || '',
          path: '/',
        },
      ],
      headers: input.host ? { 'x-custom-domain': input.host } : {},
    }
  }

  const orgSlug =
    hostingMode === 'single'
      ? instanceInfo.default_org_slug
      : context.hostMode === 'subdomain'
        ? context.resolvedOrgSlug
        : instanceInfo.default_org_slug

  return {
    action: 'rewrite',
    destination: `/orgs/${orgSlug}${pathname}`,
  }
}
