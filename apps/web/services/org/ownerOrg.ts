import { getConfig, getDefaultOrg } from '@services/config/config'
import { ROUTING_COOKIES } from '@services/routing/cookies'
import { replaceHostPreservingPort } from '@services/routing/context'
import { stripPort } from '@services/utils/ts/hostUtils'

export const getOwnerOrgSlugClient = () => {
  return getDefaultOrg()
}

export const getOwnerOrgUrl = (path: string) => {
  if (typeof window === 'undefined') {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const configuredDomain =
    getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN') ||
    document.cookie.match(new RegExp(`(?:^|; )${ROUTING_COOKIES.frontendDomain}=([^;]*)`))?.[1] ||
    window.location.host

  const decodedDomain = decodeURIComponent(configuredDomain)
  const currentOrigin = window.location.origin
  const currentHost = window.location.host
  const baseHost = decodedDomain
  const baseHostname = stripPort(baseHost)

  if (currentHost === baseHost || window.location.hostname === baseHostname) {
    return `${currentOrigin}${normalizedPath}`
  }

  return `${window.location.protocol}//${replaceHostPreservingPort(baseHostname, baseHost)}${normalizedPath}`
}
