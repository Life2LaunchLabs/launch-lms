import { ROUTING_COOKIES } from '@services/routing/cookies'
import { routePaths } from '@services/routing/paths'
import {
  replaceHostPreservingPort,
  resolveOrgHostContext,
} from '@services/routing/context'
import { isSubdomainOf, isSameHost, isLocalhost as isLocalhostCheck } from '@services/utils/ts/hostUtils'

// Runtime configuration cache
let runtimeConfig: Record<string, string> | null = null;
let serverConfigLoaded = false;

// Lazy load runtime configuration
function loadRuntimeConfig(): Record<string, string> {
  if (typeof window !== 'undefined') {
    // Client-side: always read from window.__RUNTIME_CONFIG__ (may be injected after first call)
    if ((window as any).__RUNTIME_CONFIG__) {
      runtimeConfig = (window as any).__RUNTIME_CONFIG__;
    }
    return runtimeConfig || {};
  }

  // Server-side: cache after first successful load
  if (serverConfigLoaded && runtimeConfig) {
    return runtimeConfig;
  }

  runtimeConfig = {};

  if (typeof window === 'undefined') {
    // Server-side: try to read from runtime-config.json
    // Try multiple possible paths for standalone mode
    try {
      const fs = require('fs');
      const path = require('path');
      
      // In standalone mode, runtime-config.json is in the same directory as server.js
      // Try common possible locations relative to the current working directory and module
      const possiblePaths = [
        path.join(process.cwd(), 'runtime-config.json'),
        path.join(__dirname || process.cwd(), 'runtime-config.json'),
        path.join(__dirname || process.cwd(), '..', 'runtime-config.json'),
      ];
      
      for (const configPath of possiblePaths) {
        try {
          if (fs.existsSync(configPath)) {
            runtimeConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            break;
          }
        } catch {
          // Continue to next path
        }
      }
    } catch {
      // fs/path not available (client-side bundle), skip
    }
    serverConfigLoaded = true;
  }

  return runtimeConfig || {};
}

// Helper function to get config value with fallback
export const getConfig = (key: string, defaultValue: string = ''): string => {
  const config = loadRuntimeConfig();
  
  // 1. Check runtime config (from runtime-config.json or the generated runtime-config.js)
  if (config && config[key]) {
    return config[key];
  }

  // 2. Fallback to process.env (Server-side only)
  return process.env[key] || defaultValue;
};

// Helper to read a cookie value by name (client-side only)
const getCookieValue = (name: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

// Dynamic config getters - these are functions to ensure runtime values are used
const getLAUNCHLMS_HTTP_PROTOCOL = () =>
  (getConfig('NEXT_PUBLIC_LAUNCHLMS_HTTPS') === 'true') ? 'https://' : 'http://'
const getLAUNCHLMS_BACKEND_URL = () => getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL', 'http://localhost/')
const getLAUNCHLMS_DOMAIN = () => {
  // 1. Env var (backward compat for existing deploys)
  const envVal = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  if (envVal) return envVal
  // 2. Cookie set by middleware from backend instance info
  const cookieVal = getCookieValue(ROUTING_COOKIES.frontendDomain)
  if (cookieVal) return cookieVal
  // 3. Fall back to the current browser host in dev before hardcoding localhost
  if (typeof window !== 'undefined' && window.location.host) return window.location.host
  // 4. Default
  return 'localhost'
}
const getLAUNCHLMS_TOP_DOMAIN = () => {
  // 1. Env var (backward compat for existing deploys)
  const envVal = getConfig('NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN')
  if (envVal) return envVal
  // 2. Cookie set by middleware from backend instance info
  const cookieVal = getCookieValue(ROUTING_COOKIES.topDomain)
  if (cookieVal) return cookieVal
  // 3. Derive from DOMAIN by stripping port
  const domain = getLAUNCHLMS_DOMAIN()
  return domain.split(':')[0]
}
const getLAUNCHLMS_TELEMETRY_DISABLED = () => getConfig('NEXT_TELEMETRY_DISABLED', 'true').toLowerCase();

// Export getter functions for dynamic runtime configuration
export const getLAUNCHLMS_HTTP_PROTOCOL_VAL = getLAUNCHLMS_HTTP_PROTOCOL
export const getLAUNCHLMS_BACKEND_URL_VAL = getLAUNCHLMS_BACKEND_URL
export const getLAUNCHLMS_DOMAIN_VAL = getLAUNCHLMS_DOMAIN
export const getLAUNCHLMS_TOP_DOMAIN_VAL = getLAUNCHLMS_TOP_DOMAIN
export const getLAUNCHLMS_TELEMETRY_DISABLED_VAL = getLAUNCHLMS_TELEMETRY_DISABLED

// Export constants for backward compatibility
// These are computed once at module load, but getConfig uses runtime values
// For middleware/proxy (where runtime is critical), use the getter functions instead
export const LAUNCHLMS_HTTP_PROTOCOL = getLAUNCHLMS_HTTP_PROTOCOL()
export const LAUNCHLMS_BACKEND_URL = getLAUNCHLMS_BACKEND_URL()
export const LAUNCHLMS_DOMAIN = getLAUNCHLMS_DOMAIN()
export const LAUNCHLMS_TOP_DOMAIN = getLAUNCHLMS_TOP_DOMAIN()

export const getAPIUrl = () => {
  if (typeof window === 'undefined') {
    // Server-side: absolute URL required — relative paths are invalid in Node.js fetch
    const internal = process.env.LAUNCHLMS_INTERNAL_API_URL
    if (internal) return internal.endsWith('/') ? internal : `${internal}/`
    const internalBackend = process.env.LAUNCHLMS_INTERNAL_BACKEND_URL
    if (internalBackend) return `${internalBackend.replace(/\/+$/, '')}/api/v1/`
    return 'http://localhost/api/v1/'
  }
  // Client-side: relative path always works — frontend and API share the same origin via Nginx.
  // Explicit URL only used for split deployments (separate frontend/backend servers).
  const explicit = getConfig('NEXT_PUBLIC_LAUNCHLMS_API_URL')
  return explicit || '/api/v1/'
}

// Server-side only — always returns an absolute URL for use in Server Components and API routes
export const getServerAPIUrl = () => {
  const internal = process.env.LAUNCHLMS_INTERNAL_API_URL
  if (internal) return internal.endsWith('/') ? internal : `${internal}/`
  const internalBackend = process.env.LAUNCHLMS_INTERNAL_BACKEND_URL
  if (internalBackend) return `${internalBackend.replace(/\/+$/, '')}/api/v1/`
  const backendUrl = getLAUNCHLMS_BACKEND_URL().replace(/\/+$/, '')
  return `${backendUrl}/api/v1/`
}

export const getBackendUrl = () => getLAUNCHLMS_BACKEND_URL()

// Multi Organization Mode
export const isMultiOrgModeEnabled = () => {
  // 1. Client-side: read cookie set by middleware
  const cookieVal = getCookieValue(ROUTING_COOKIES.multiOrg)
  if (cookieVal !== null) return cookieVal === 'true'
  // 2. Core Launch LMS always supports multiple organizations.
  return true
}

/**
 * Get custom domain from context (client-side only)
 * Returns the custom domain with port if we're on one, null otherwise
 */
export const getCustomDomainFromContext = (): string | null => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    const host = window.location.host // includes port if non-standard
    const domain = getLAUNCHLMS_DOMAIN()

    // Check if current hostname is a custom domain (not a subdomain of LAUNCHLMS_DOMAIN)
    const isSub = isSubdomainOf(hostname, domain) || isSameHost(hostname, domain)
    const isLocal = isLocalhostCheck(hostname)

    if (!isSub && !isLocal) {
      // Return host (includes port) for custom domains
      return host
    }

    // Also check cookie as fallback (for cases where hostname check might not work)
    try {
      const cookies = document.cookie.split(';')
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=')
        if (name === ROUTING_COOKIES.customDomain && value) {
          // Cookie only stores hostname, so add current port if present
          const cookieDomain = decodeURIComponent(value)
          const port = window.location.port
          if (port && port !== '80' && port !== '443') {
            return `${cookieDomain}:${port}`
          }
          return cookieDomain
        }
      }
    } catch {
      // Ignore cookie parsing errors
    }
  }
  return null
}

export const getUriWithOrg = (orgslug: string, path: string) => {
  const ownerOrgSlug = getDefaultOrg()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  // Client-side: prefer using current origin when appropriate
  if (typeof window !== 'undefined') {
    const multi_org = isMultiOrgModeEnabled()
    const context = resolveOrgHostContext({
      host: window.location.host,
      frontendDomain: getLAUNCHLMS_DOMAIN(),
      defaultOrgSlug: ownerOrgSlug,
      resolvedCustomDomainOrgSlug: null,
    })

    if (!multi_org || context.hostMode === 'custom') {
      return `${window.location.origin}${normalizedPath}`
    }

    const isOwnerOrg = orgslug === ownerOrgSlug
    const expectedHostname = isOwnerOrg
      ? context.bareFrontendDomain
      : `${orgslug}.${context.bareFrontendDomain}`

    if (
      window.location.hostname === expectedHostname ||
      (window.location.hostname === context.bareFrontendDomain &&
        (context.isLocalhost || isOwnerOrg))
    ) {
      return `${window.location.origin}${normalizedPath}`
    }

    const targetHost = replaceHostPreservingPort(
      expectedHostname,
      getLAUNCHLMS_DOMAIN()
    )
    return `${window.location.protocol}//${targetHost}${normalizedPath}`
  }

  // Server-side fallback to config-based URL construction
  const multi_org = isMultiOrgModeEnabled()
  const explicitDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  if (multi_org) {
    const protocol = getLAUNCHLMS_HTTP_PROTOCOL()
    const domain = getLAUNCHLMS_DOMAIN()
    if (orgslug === ownerOrgSlug) {
      return `${protocol}${domain}${normalizedPath}`
    }
    return `${protocol}${orgslug}.${domain}${normalizedPath}`
  }
  if (explicitDomain) {
    // Explicit domain configured: construct absolute URL (needed for RSS, SEO, server-side fetches)
    const protocol = getLAUNCHLMS_HTTP_PROTOCOL()
    return `${protocol}${explicitDomain}${normalizedPath}`
  }
  // No explicit domain configured: return relative path to avoid hardcoded 'localhost'
  // URLs in SSR output that break on non-localhost deployments
  return normalizedPath
}

export const getUriWithoutOrg = (path: string) => {
  // Client-side: always use current origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`
  }

  // Server-side fallback
  const explicitDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  if (explicitDomain) {
    const protocol = getLAUNCHLMS_HTTP_PROTOCOL()
    return `${protocol}${explicitDomain}${path}`
  }
  // No explicit domain configured: return relative path to avoid hardcoded 'localhost' URLs
  return path
}

/**
 * Build a URI on the main domain (not the org subdomain).
 * Useful for OAuth redirect URIs where only one fixed URI can be registered
 * (e.g., Stripe Connect requires exact redirect_uri matching).
 */
export const getMainDomainUri = (path: string) => {
  const protocol = getLAUNCHLMS_HTTP_PROTOCOL()
  const domain = getLAUNCHLMS_DOMAIN()
  return `${protocol}${domain}${path}`
}

export const getCoreCapabilities = () => ({
  multi_org: true,
  superadmin: true,
  audit_logs: true,
  oauth: false,
  payments: false,
  sso: true,
  scorm: true,
  advanced_analytics: true,
})

// Collaboration server WebSocket URL
export const getCollabUrl = () => getConfig('NEXT_PUBLIC_COLLAB_URL', 'ws://localhost:4000')

export const getDefaultOrg = () => {
  // 1. Env var (backward compat)
  const envVal = getConfig('NEXT_PUBLIC_LAUNCHLMS_DEFAULT_ORG')
  if (envVal) return envVal
  // 2. Client-side: read cookie set by middleware
  const cookieVal = getCookieValue(ROUTING_COOKIES.defaultOrg)
  if (cookieVal) return cookieVal
  // 3. Default
  return 'default'
}

export { routePaths }
