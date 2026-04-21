import { getConfig, getDefaultOrg } from '@services/config/config'
import { ROUTING_COOKIES } from '@services/routing/cookies'
import { replaceHostPreservingPort } from '@services/routing/context'
import { stripPort } from '@services/utils/ts/hostUtils'

const getCookieValue = (name: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

export function getOrgAdminEntryUrl(orgslug: string, path: string = '/dash') {
  if (typeof window === 'undefined') {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const ownerOrgSlug = getDefaultOrg()
  const configuredDomain =
    getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN') ||
    getCookieValue(ROUTING_COOKIES.frontendDomain) ||
    window.location.host

  const baseHost = decodeURIComponent(configuredDomain)
  const baseHostname = stripPort(baseHost)
  const isOwnerOrg = orgslug === ownerOrgSlug
  const targetHostname = isOwnerOrg ? baseHostname : `${orgslug}.${baseHostname}`
  const targetHost = replaceHostPreservingPort(targetHostname, baseHost)

  if (window.location.host === targetHost || window.location.hostname === targetHostname) {
    return `${window.location.origin}${normalizedPath}`
  }

  return `${window.location.protocol}//${targetHost}${normalizedPath}`
}
