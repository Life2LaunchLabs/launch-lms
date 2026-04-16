import { cookies } from 'next/headers'
import { getDefaultOrg } from '@services/config/config'

const OWNER_ORG_COOKIE = 'launchlms_default_org'

export async function getOwnerOrgSlugServer() {
  try {
    const cookieStore = await cookies()
    const cookieValue = cookieStore.get(OWNER_ORG_COOKIE)?.value
    if (cookieValue) return cookieValue
  } catch {
    // Ignore cookie access issues and fall back to the configured default.
  }

  return getDefaultOrg()
}
