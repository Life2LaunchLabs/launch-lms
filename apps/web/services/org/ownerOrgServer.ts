import { cookies } from 'next/headers'
import { getDefaultOrg, getServerAPIUrl } from '@services/config/config'
import { ROUTING_COOKIES } from '@services/routing/cookies'

const OWNER_ORG_COOKIE = ROUTING_COOKIES.defaultOrg

export async function getOwnerOrgSlugServer() {
  try {
    const cookieStore = await cookies()
    const cookieValue = cookieStore.get(OWNER_ORG_COOKIE)?.value
    if (cookieValue) return cookieValue
  } catch {
    // Ignore cookie access issues and fall back to the configured default.
  }

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
    // Ignore instance info lookup issues and fall back below.
  }

  return getDefaultOrg()
}
