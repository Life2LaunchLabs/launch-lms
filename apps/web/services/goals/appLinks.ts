/** A link to one of the app's own pages that a board can name from the app itself, not by fetching the page. */
export type AppLink = { kind: 'resource'; uuid: string } | { kind: 'plan'; uuid: string }

/**
 * What a pasted link points at, when it is a page of this app: a resource sheet over Discover
 * (`/discover?r=…`, also from Careers and Explore) or a plan's Discover page (`/discover/plans/…`).
 * `appHost` is the app's top domain; its org subdomains count too. Anything else is an outside link.
 */
export function appLinkOf(url: string, appHost: string): AppLink | null {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const home = (appHost || '').toLowerCase().split(':')[0].replace(/^www\./, '')
  if (!home || (host !== home && !host.endsWith(`.${home}`))) return null
  // Path-based org links (/orgs/<slug>/discover…) open the same pages.
  const path = parsed.pathname.replace(/^\/orgs\/[^/]+(?=\/)/, '').replace(/\/+$/, '')
  const plan = path.match(/^\/discover\/plans\/([^/]+)$/)
  if (plan) return { kind: 'plan', uuid: decodeURIComponent(plan[1]) }
  const resource = parsed.searchParams.get('r')
  if (resource && (path === '/discover' || path.startsWith('/discover/'))) {
    return { kind: 'resource', uuid: resource.startsWith('resource_') ? resource : `resource_${resource}` }
  }
  return null
}
