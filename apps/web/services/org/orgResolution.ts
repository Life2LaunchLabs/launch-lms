import { headers } from 'next/headers'
import { getOrganizationContextInfoWithoutCredentials, getOrganizationContextInfoWithUUID } from '@services/organizations/orgs'
import { getConfig, getServerAPIUrl } from '@services/config/config'
import { resolveOrgHostContext, type OrgHostContext } from '@services/routing/context'

async function getServerDomain(): Promise<string> {
  const envVal = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN')
  if (envVal) return envVal

  const devHost = process.env.LAUNCHLMS_DEV_PUBLIC_HOST
  if (devHost) return `${devHost}:3000`

  return 'localhost'
}

async function getServerDefaultOrgSlug(): Promise<string> {
  try {
    const res = await fetch(`${getServerAPIUrl()}instance/info`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.default_org_slug) return data.default_org_slug
    }
  } catch {
    // Fall back to configured default below.
  }

  return getConfig('NEXT_PUBLIC_LAUNCHLMS_DEFAULT_ORG', 'default')
}

async function readServerOrgHostContext(): Promise<OrgHostContext | null> {
  try {
    const [headersList, frontendDomain] = await Promise.all([
      headers(),
      getServerDomain(),
    ])

    const host = headersList.get('host')
    if (!host) return null

    return resolveOrgHostContext({
      host,
      frontendDomain,
      defaultOrgSlug: await getServerDefaultOrgSlug(),
      resolvedCustomDomainOrgSlug: null,
    })
  } catch {
    return null
  }
}

export interface ResolvedOrg {
  id: number
  slug: string
  name: string
  org_uuid: string
  logo_image?: string
  [key: string]: any
}

export interface OrgResolutionResult {
  org: ResolvedOrg | null
  source: 'host' | 'token' | 'none'
  error?: string
}

export async function resolveOrg(searchParams?: { token?: string }): Promise<OrgResolutionResult> {
  const hostOrgSlug = await getHostOrgSlug()
  if (hostOrgSlug) {
    const org = await fetchOrgBySlug(hostOrgSlug)
    if (org) {
      return { org, source: 'host' }
    }
  }

  if (searchParams?.token) {
    const tokenOrg = await resolveFromToken(searchParams.token)
    if (tokenOrg) {
      return { org: tokenOrg, source: 'token' }
    }
  }

  return { org: null, source: 'none' }
}

export async function getHostOrgSlug(): Promise<string | null> {
  const context = await readServerOrgHostContext()
  if (!context) return null
  return context.resolvedOrgSlug || null
}

export async function getTokenOrgSlug(token?: string | null): Promise<string | null> {
  if (!token) return null

  const payload = decodeTokenPayload(token)
  if (!payload?.org_uuid) return null

  const org = await fetchOrgByUUID(payload.org_uuid)
  return org?.slug || null
}

export async function getAuthBrandingOrgSlug(token?: string | null): Promise<string | null> {
  const tokenOrgSlug = await getTokenOrgSlug(token)
  if (tokenOrgSlug) return tokenOrgSlug
  return getHostOrgSlug()
}

async function resolveFromToken(token: string): Promise<ResolvedOrg | null> {
  const orgSlug = await getTokenOrgSlug(token)
  if (!orgSlug) return null
  return fetchOrgBySlug(orgSlug)
}

function decodeTokenPayload(token: string): { org_uuid?: string; email?: string; action?: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const payload = parts[1]
    const decoded = Buffer.from(payload, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

async function fetchOrgBySlug(orgslug: string): Promise<ResolvedOrg | null> {
  try {
    const org = await getOrganizationContextInfoWithoutCredentials(orgslug, {
      revalidate: 60,
      tags: ['organizations'],
    })

    if (!org || org.error) {
      return null
    }

    return org as ResolvedOrg
  } catch (error) {
    console.error('Error fetching org by slug:', error)
    return null
  }
}

async function fetchOrgByUUID(orgUUID: string): Promise<ResolvedOrg | null> {
  try {
    const org = await getOrganizationContextInfoWithUUID(orgUUID, {
      revalidate: 60,
      tags: ['organizations'],
    }, '')

    if (!org || org.error) {
      return null
    }

    return org as ResolvedOrg
  } catch (error) {
    console.error('Error fetching org by uuid:', error)
    return null
  }
}
