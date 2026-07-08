export type RouteAccessKind =
  | 'public'
  | 'protected'
  | 'auth'
  | 'callback'
  | 'internal'
  | 'special'

export interface RouteAccessClassification {
  kind: RouteAccessKind
}

const AUTH_PATHS = new Set(['/login', '/signup', '/signup/org', '/reset', '/forgot', '/verify-email'])
const AUTH_CALLBACK_PREFIXES = ['/auth/sso/', '/auth/callback/', '/auth/token-exchange']
const PUBLIC_EXACT_PATHS = new Set(['/', '/news', '/quickstart', '/welcome'])
const PUBLIC_PREFIXES = ['/news/', '/quickstart/']
const PUBLIC_COURSE_PATH_RE = /^\/course\/[^/]+(\/activity\/[^/]+)?$/
const PUBLIC_BADGE_ENTRY_PATH_RE = /^\/badges\/[^/]+(\/invite)?$/
const EDITOR_ACTIVITY_RE = /^\/course\/[^/]+\/activity\/[^/]+\/edit$/
const SPECIAL_PREFIXES = ['/board/', '/editor/playground/', '/payments/stripe/connect/oauth', '/health']
const SPECIAL_EXACT_PATHS = new Set(['/sitemap.xml', '/robots.txt', '/redirect_from_auth'])
const PODCAST_FEED_RE = /^\/podcast\/([^/]+)\/feed$/

export function isAuthenticatedAuthRedirectPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/signup'
}

export function isEditorActivityPath(pathname: string): boolean {
  return EDITOR_ACTIVITY_RE.test(pathname)
}

export function isPodcastFeedPath(pathname: string): boolean {
  return PODCAST_FEED_RE.test(pathname)
}

export function classifyRoute(pathname: string): RouteAccessClassification {
  if (pathname.startsWith('/orgs/')) {
    return { kind: 'internal' }
  }

  if (AUTH_PATHS.has(pathname)) {
    return { kind: 'auth' }
  }

  if (AUTH_CALLBACK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return { kind: 'callback' }
  }

  if (
    SPECIAL_EXACT_PATHS.has(pathname) ||
    SPECIAL_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    isEditorActivityPath(pathname) ||
    isPodcastFeedPath(pathname)
  ) {
    return { kind: 'special' }
  }

  if (
    PUBLIC_EXACT_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_COURSE_PATH_RE.test(pathname) ||
    PUBLIC_BADGE_ENTRY_PATH_RE.test(pathname)
  ) {
    return { kind: 'public' }
  }

  return { kind: 'protected' }
}
