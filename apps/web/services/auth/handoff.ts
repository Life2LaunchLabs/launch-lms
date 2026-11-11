import { getConfig, getLAUNCHLMS_DOMAIN_VAL } from '@services/config/config'
import { isManagedHost, safeHandoffPath } from '@services/routing/handoff'

/** Wrap authenticated cross-org navigation; public and same-host links stay ordinary links. */
export function authenticatedOrgHref(destination: string, authenticated: boolean): string {
  if (typeof window === 'undefined' || !authenticated ||
      getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain') !== 'host-only') return destination
  try {
    const target = new URL(destination, window.location.origin)
    const current = window.location
    const domain = getLAUNCHLMS_DOMAIN_VAL()
    if (target.origin === current.origin || target.protocol !== current.protocol ||
        !isManagedHost(current.host, domain) || !isManagedHost(target.host, domain)) return destination
    const path = `${target.pathname}${target.search}${target.hash}`
    if (!safeHandoffPath(path)) return destination
    const handoff = new URL('/api/auth/handoff/start', target.origin)
    handoff.searchParams.set('source', current.host)
    handoff.searchParams.set('return', path)
    return handoff.toString()
  } catch {
    return destination
  }
}

/** Open a page on an organization's address: a client-side push on this address, a full page load (sign-in carried over) on another. */
// eslint-disable-next-line no-unused-vars
export function openOrgPage(destination: string, push: (href: string) => void): void {
  const target = authenticatedOrgHref(destination, true)
  if (new URL(target, window.location.origin).origin === window.location.origin) push(target)
  else window.location.assign(target)
}
