import fs from 'node:fs'
import path from 'node:path'
import { routePaths } from '@services/routing/paths'

let runtimeConfig: Record<string, string> | null = null
let serverConfigLoaded = false

export function loadRuntimeConfigFromDisk(): Record<string, string> {
  const possiblePaths = [
    path.join(process.cwd(), 'runtime-config.json'),
    path.join(__dirname, 'runtime-config.json'),
    path.join(__dirname, '..', 'runtime-config.json'),
  ]

  for (const configPath of possiblePaths) {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'))
      }
    } catch {
      // Continue to the next location.
    }
  }

  return {}
}

function loadRuntimeConfig(): Record<string, string> {
  if (serverConfigLoaded && runtimeConfig) {
    return runtimeConfig
  }

  runtimeConfig = loadRuntimeConfigFromDisk()
  serverConfigLoaded = true
  return runtimeConfig
}

export function getConfig(key: string, defaultValue: string = ''): string {
  const config = loadRuntimeConfig()
  if (config[key]) return config[key]
  return process.env[key] || defaultValue
}

const getLAUNCHLMS_HTTP_PROTOCOL = () =>
  getConfig('NEXT_PUBLIC_LAUNCHLMS_HTTPS') === 'true' ? 'https://' : 'http://'
const getLAUNCHLMS_BACKEND_URL = () =>
  getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL', 'http://localhost/')
const getLAUNCHLMS_DOMAIN = () =>
  getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN', 'localhost')
const getLAUNCHLMS_TOP_DOMAIN = () =>
  getConfig('NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN') || getLAUNCHLMS_DOMAIN().split(':')[0]
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

export const getAPIUrl = () => getServerAPIUrl()

export const getServerAPIUrl = () => {
  const internal = process.env.LAUNCHLMS_INTERNAL_API_URL
  if (internal) return internal.endsWith('/') ? internal : `${internal}/`

  const internalBackend = process.env.LAUNCHLMS_INTERNAL_BACKEND_URL
  if (internalBackend) return `${internalBackend.replace(/\/+$/, '')}/api/v1/`

  const backendUrl = getLAUNCHLMS_BACKEND_URL().replace(/\/+$/, '')
  return `${backendUrl}/api/v1/`
}

export const getBackendUrl = () => getLAUNCHLMS_BACKEND_URL()

export const isMultiOrgModeEnabled = () => true

export const getDefaultOrg = () =>
  getConfig('NEXT_PUBLIC_LAUNCHLMS_DEFAULT_ORG', 'default')

export const getUriWithOrg = (orgslug: string, pathValue: string) => {
  const ownerOrgSlug = getDefaultOrg()
  const normalizedPath = pathValue.startsWith('/') ? pathValue : `/${pathValue}`
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

export const getUriWithoutOrg = (pathValue: string) => {
  const explicitDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  if (explicitDomain) {
    return `${getLAUNCHLMS_HTTP_PROTOCOL()}${explicitDomain}${pathValue}`
  }

  return pathValue
}

export const getMainDomainUri = (pathValue: string) => {
  const protocol = getLAUNCHLMS_HTTP_PROTOCOL()
  const domain = getLAUNCHLMS_DOMAIN()
  return `${protocol}${domain}${pathValue}`
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
