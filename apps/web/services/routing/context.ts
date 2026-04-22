import {
  extractSubdomain,
  isLocalhost,
  isSameHost,
  isSubdomainOf,
  stripPort,
} from '../utils/ts/hostUtils.ts'

export const RESERVED_SUBDOMAINS = new Set(['auth', 'www', 'api', 'admin'])

export type HostMode = 'main' | 'subdomain' | 'custom'

export interface OrgHostContextInput {
  host: string | null | undefined
  frontendDomain: string
  defaultOrgSlug: string
  resolvedCustomDomainOrgSlug?: string | null
  subdomainAllowed?: boolean
}

export interface OrgHostContext {
  host: string
  bareHost: string
  frontendDomain: string
  bareFrontendDomain: string
  defaultOrgSlug: string
  cookieOrgSlug: string | null
  resolvedOrgSlug: string
  hostMode: HostMode
  subdomainOrgSlug: string | null
  resolvedCustomDomainOrgSlug: string | null
  subdomainAllowed: boolean
  isCustomDomain: boolean
  isOwnerOrg: boolean
  isLocalhost: boolean
}

export function isReservedSubdomain(subdomain: string | null | undefined): boolean {
  return !!subdomain && RESERVED_SUBDOMAINS.has(subdomain)
}

export function getOrgSlugFromSubdomain(
  host: string | null | undefined,
  frontendDomain: string
): string | null {
  const extracted = extractSubdomain(host, frontendDomain)
  if (!extracted || isReservedSubdomain(extracted)) {
    return null
  }
  return extracted
}

export function isCustomDomainHost(
  host: string | null | undefined,
  frontendDomain: string
): boolean {
  if (!host) return false
  return (
    !isSubdomainOf(host, frontendDomain) &&
    !isSameHost(host, frontendDomain) &&
    !isLocalhost(host)
  )
}

export function resolveOrgHostContext(input: OrgHostContextInput): OrgHostContext {
  const bareHost = stripPort(input.host)
  const bareFrontendDomain = stripPort(input.frontendDomain)
  const subdomainOrgSlug = getOrgSlugFromSubdomain(input.host, input.frontendDomain)
  const isCustomDomain = isCustomDomainHost(input.host, input.frontendDomain)
  const resolvedCustomDomainOrgSlug = input.resolvedCustomDomainOrgSlug || null
  const subdomainAllowed = input.subdomainAllowed ?? true

  let hostMode: HostMode = 'main'
  let resolvedOrgSlug = input.defaultOrgSlug

  if (isCustomDomain) {
    hostMode = 'custom'
    resolvedOrgSlug = resolvedCustomDomainOrgSlug || input.defaultOrgSlug
  } else if (subdomainOrgSlug) {
    hostMode = 'subdomain'
    resolvedOrgSlug = subdomainOrgSlug
  } else {
    resolvedOrgSlug = input.defaultOrgSlug
  }

  return {
    host: input.host || '',
    bareHost,
    frontendDomain: input.frontendDomain,
    bareFrontendDomain,
    defaultOrgSlug: input.defaultOrgSlug,
    cookieOrgSlug: null,
    resolvedOrgSlug,
    hostMode,
    subdomainOrgSlug,
    resolvedCustomDomainOrgSlug,
    subdomainAllowed,
    isCustomDomain,
    isOwnerOrg: resolvedOrgSlug === input.defaultOrgSlug,
    isLocalhost: isLocalhost(input.host),
  }
}

export function replaceHostPreservingPort(targetHostname: string, configuredHost: string): string {
  return configuredHost.includes(':')
    ? `${targetHostname}:${configuredHost.split(':').slice(1).join(':')}`
    : targetHostname
}

export function buildMainDomainUrl(
  requestUrl: string,
  pathname: string,
  search: string,
  frontendDomain: string
): string {
  const url = new URL(requestUrl)
  url.host = frontendDomain
  url.pathname = pathname
  url.search = search
  return url.toString()
}

export function buildOrgSubdomainUrl(
  requestUrl: string,
  orgSlug: string,
  pathname: string,
  search: string,
  frontendDomain: string
): string {
  const bareFrontendDomain = stripPort(frontendDomain)
  const targetHostname = `${orgSlug}.${bareFrontendDomain}`
  const url = new URL(requestUrl)
  url.host = replaceHostPreservingPort(targetHostname, frontendDomain)
  url.pathname = pathname
  url.search = search
  return url.toString()
}
