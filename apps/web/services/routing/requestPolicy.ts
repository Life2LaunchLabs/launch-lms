import { ROUTING_COOKIES } from './cookies.ts'
import {
  buildOrgSubdomainUrl,
  buildMainDomainUrl,
  resolveOrgHostContext,
} from './context.ts'
import {
  classifyRoute,
  isAuthenticatedAuthRedirectPath,
  isEditorActivityPath,
  isPodcastFeedPath,
} from './routeAccess.ts'

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

function getAdminMigrationPath(pathname: string): string {
  if (pathname === '/login') return '/login'
  if (pathname === '/' || pathname === '') return '/admin/platform'
  if (pathname === '/organizations') return '/admin/platform/orgs'
  if (pathname.startsWith('/organizations/')) {
    const orgId = pathname.split('/')[2]
    return `/admin/platform/orgs/${orgId}`
  }
  if (pathname === '/users') return '/admin/platform/users'
  if (pathname === '/analytics') return '/admin/platform'
  return '/admin/platform'
}

function getPortfolioRedirectDestination(requestUrl: string): string {
  return new URL('/portfolio', requestUrl).toString()
}

function parseInternalOrgPath(pathname: string): { orgSlug: string; externalPath: string } | null {
  const match = pathname.match(/^\/orgs\/([^/]+)(\/.*)?$/)
  if (!match) return null
  return {
    orgSlug: decodeURIComponent(match[1]),
    externalPath: match[2] || '/',
  }
}

function buildCanonicalOrgUrl(
  input: ResolveRequestRoutingInput,
  orgSlug: string,
  externalPath: string,
  hostingMode: 'multi' | 'single'
): string {
  const { instanceInfo, requestUrl, search } = input

  if (
    input.resolvedCustomDomainOrgSlug &&
    input.resolvedCustomDomainOrgSlug === orgSlug
  ) {
    const url = new URL(requestUrl)
    url.pathname = externalPath
    url.search = search
    return url.toString()
  }

  if (hostingMode === 'multi' && orgSlug !== instanceInfo.default_org_slug) {
    return buildOrgSubdomainUrl(
      requestUrl,
      orgSlug,
      externalPath,
      search,
      instanceInfo.frontend_domain
    )
  }

  return buildMainDomainUrl(
    requestUrl,
    externalPath,
    search,
    instanceInfo.frontend_domain
  )
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
  const route = classifyRoute(pathname)

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

  if (route.kind === 'auth') {
    if (input.hasSession && isAuthenticatedAuthRedirectPath(pathname)) {
      return {
        action: 'redirect',
        destination: getPortfolioRedirectDestination(input.requestUrl),
      }
    }

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

  if (route.kind === 'callback') {
    return {
      action: 'rewrite',
      destination: `${pathname}${search}`,
    }
  }

  if (pathname === '/welcome') {
    return {
      action: 'next',
    }
  }

  if (isEditorActivityPath(pathname)) {
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
    !pathname.startsWith('/admin') &&
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

  if (route.kind === 'internal') {
    const internalPath = parseInternalOrgPath(pathname)
    if (internalPath) {
      return {
        action: 'redirect',
        destination: buildCanonicalOrgUrl(
          input,
          internalPath.orgSlug,
          internalPath.externalPath,
          hostingMode
        ),
      }
    }

    return {
      action: 'redirect',
      destination: new URL('/', input.requestUrl).toString(),
    }
  }

  if (pathname === '/redirect_from_auth') {
    return {
      action: 'rewrite',
      destination: `/auth/redirect${search}`,
    }
  }

  if (isPodcastFeedPath(pathname)) {
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

  if (!input.hasSession && route.kind === 'protected') {
    return {
      action: 'redirect',
      destination: new URL('/', input.requestUrl).toString(),
    }
  }

  const orgSlug =
    hostingMode === 'single'
      ? instanceInfo.default_org_slug
      : context.hostMode === 'subdomain' || context.hostMode === 'custom'
        ? context.resolvedOrgSlug
        : instanceInfo.default_org_slug

  if (pathname === '/') {
    if (input.hasSession) {
      return {
        action: 'redirect',
        destination: getPortfolioRedirectDestination(input.requestUrl),
      }
    }

    return {
      action: 'rewrite',
      destination: `/orgs/${orgSlug}/${search}`,
    }
  }

  if (context.hostMode === 'custom' && input.resolvedCustomDomainOrgSlug) {
    return {
      action: 'rewrite',
      destination: `/orgs/${input.resolvedCustomDomainOrgSlug}${pathname}${search}`,
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

  return {
    action: 'rewrite',
    destination: `/orgs/${orgSlug}${pathname}${search}`,
  }
}
