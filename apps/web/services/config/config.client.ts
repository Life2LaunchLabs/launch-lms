import { ROUTING_COOKIES } from '@services/routing/cookies'
import { routePaths } from '@services/routing/paths'
import {
  replaceHostPreservingPort,
  resolveOrgHostContext,
} from '@services/routing/context'
import { isSubdomainOf, isSameHost, isLocalhost as isLocalhostCheck } from '@services/utils/ts/hostUtils'

let runtimeConfig: Record<string, string> | null = null

function getRuntimeConfig(): Record<string, string> {
  if ((window as any).__RUNTIME_CONFIG__) {
    runtimeConfig = (window as any).__RUNTIME_CONFIG__
  }

  return runtimeConfig || {}
}

export function getConfig(key: string, defaultValue: string = ''): string {
  if (typeof window !== 'undefined') {
    const config = getRuntimeConfig()
    if (config[key]) return config[key]
  }

  return process.env[key] || defaultValue
}

function getCookieValue(name: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

const getLAUNCHLMS_HTTP_PROTOCOL = () =>
  getConfig('NEXT_PUBLIC_LAUNCHLMS_HTTPS') === 'true' ? 'https://' : 'http://'
const getLAUNCHLMS_BACKEND_URL = () =>
  getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL', 'http://localhost/')
const getLAUNCHLMS_DOMAIN = () => {
  const envVal = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  if (envVal) return envVal

  const cookieVal = getCookieValue(ROUTING_COOKIES.frontendDomain)
  if (cookieVal) return cookieVal

  if (typeof window !== 'undefined' && window.location.host) return window.location.host
  return 'localhost'
}
const getLAUNCHLMS_TOP_DOMAIN = () => {
  const envVal = getConfig('NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN')
  if (envVal) return envVal

  const cookieVal = getCookieValue(ROUTING_COOKIES.topDomain)
  if (cookieVal) return cookieVal

  return getLAUNCHLMS_DOMAIN().split(':')[0]
}
const getLAUNCHLMS_TELEMETRY_DISABLED = () =>
  getConfig('NEXT_TELEMETRY_DISABLED', 'true').toLowerCase()

export const getLAUNCHLMS_HTTP_PROTOCOL_VAL = getLAUNCHLMS_HTTP_PROTOCOL
export const getLAUNCHLMS_BACKEND_URL_VAL = getLAUNCHLMS_BACKEND_URL
export const getLAUNCHLMS_DOMAIN_VAL = getLAUNCHLMS_DOMAIN
export const getLAUNCHLMS_TOP_DOMAIN_VAL = getLAUNCHLMS_TOP_DOMAIN
export const getLAUNCHLMS_TELEMETRY_DISABLED_VAL = getLAUNCHLMS_TELEMETRY_DISABLED

export const LAUNCHLMS_HTTP_PROTOCOL = getLAUNCHLMS_HTTP_PROTOCOL()
export const LAUNCHLMS_BACKEND_URL = getLAUNCHLMS_BACKEND_URL()
export const LAUNCHLMS_DOMAIN = getLAUNCHLMS_DOMAIN()
export const LAUNCHLMS_TOP_DOMAIN = getLAUNCHLMS_TOP_DOMAIN()

export const getAPIUrl = () => {
  if (typeof window === 'undefined') {
    const internal = process.env.LAUNCHLMS_INTERNAL_API_URL
    if (internal) return internal.endsWith('/') ? internal : `${internal}/`

    const internalBackend = process.env.LAUNCHLMS_INTERNAL_BACKEND_URL
    if (internalBackend) return `${internalBackend.replace(/\/+$/, '')}/api/v1/`

    return 'http://localhost/api/v1/'
  }

  const explicit = getConfig('NEXT_PUBLIC_LAUNCHLMS_API_URL')
  return explicit || '/api/v1/'
}

export const getBackendUrl = () => getLAUNCHLMS_BACKEND_URL()

export const isMultiOrgModeEnabled = () => {
  const cookieVal = getCookieValue(ROUTING_COOKIES.multiOrg)
  if (cookieVal !== null) return cookieVal === 'true'
  return true
}

export const getCustomDomainFromContext = (): string | null => {
  if (typeof window === 'undefined') return null

  const hostname = window.location.hostname
  const host = window.location.host
  const domain = getLAUNCHLMS_DOMAIN()
  const isSub = isSubdomainOf(hostname, domain) || isSameHost(hostname, domain)
  const isLocal = isLocalhostCheck(hostname)

  if (!isSub && !isLocal) {
    return host
  }

  const cookieVal = getCookieValue(ROUTING_COOKIES.customDomain)
  if (!cookieVal) return null

  const port = window.location.port
  if (port && port !== '80' && port !== '443') {
    return `${cookieVal}:${port}`
  }

  return cookieVal
}

export const getDefaultOrg = () => {
  const envVal = getConfig('NEXT_PUBLIC_LAUNCHLMS_DEFAULT_ORG')
  if (envVal) return envVal

  const cookieVal = getCookieValue(ROUTING_COOKIES.defaultOrg)
  if (cookieVal) return cookieVal

  return 'default'
}

export const getUriWithOrg = (orgslug: string, path: string) => {
  const ownerOrgSlug = getDefaultOrg()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (typeof window !== 'undefined') {
    const multiOrg = isMultiOrgModeEnabled()
    const context = resolveOrgHostContext({
      host: window.location.host,
      frontendDomain: getLAUNCHLMS_DOMAIN(),
      defaultOrgSlug: ownerOrgSlug,
      resolvedCustomDomainOrgSlug: null,
    })

    if (!multiOrg || context.hostMode === 'custom') {
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

  const explicitDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  if (isMultiOrgModeEnabled()) {
    const protocol = getLAUNCHLMS_HTTP_PROTOCOL()
    const domain = getLAUNCHLMS_DOMAIN()
    if (orgslug === ownerOrgSlug) {
      return `${protocol}${domain}${normalizedPath}`
    }
    return `${protocol}${orgslug}.${domain}${normalizedPath}`
  }

  if (explicitDomain) {
    return `${getLAUNCHLMS_HTTP_PROTOCOL()}${explicitDomain}${normalizedPath}`
  }

  return normalizedPath
}

export const getUriWithoutOrg = (path: string) => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`
  }

  const explicitDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  if (explicitDomain) {
    return `${getLAUNCHLMS_HTTP_PROTOCOL()}${explicitDomain}${path}`
  }

  return path
}

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

export const getCollabUrl = () => getConfig('NEXT_PUBLIC_COLLAB_URL', 'ws://localhost:4000')

export { routePaths }
