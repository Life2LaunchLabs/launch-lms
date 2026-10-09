export type AppPageTitle = { section: string; detail?: string }

// Change title order, separator, or length here rather than route by route.
export const PAGE_TITLE_FORMAT = {
  separator: ' | ',
  maxLength: 80,
} as const

const labels: Record<string, string> = {
  account: 'Account', achievements: 'Achievements', analytics: 'Analytics', badge: 'Badges', badges: 'Badges',
  boards: 'Boards', communities: 'Communities', community: 'Communities', edit: 'Edit', hub: 'Hub',
  journal: 'Journal', marketplace: 'Marketplace', mybadges: 'My badges', news: 'News', organization: 'Organizations',
  organizations: 'Organizations', payments: 'Payments', plans: 'Plans', platform: 'Platform', playground: 'Playgrounds',
  playgrounds: 'Playgrounds', podcast: 'Podcasts', podcasts: 'Podcasts', portfolio: 'Portfolio', programs: 'Programs',
  projects: 'Projects', reporting: 'Reporting', requirements: 'Requirements', resource: 'Resources', resources: 'Resources',
  notifications: 'Notifications', profile: 'Profile', resume: 'Résumé', search: 'Search', settings: 'Settings', store: 'Store', tags: 'Tags', timeline: 'Timeline', users: 'Users',
}

function humanize(segment: string) {
  const decoded = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim()
  return decoded ? decoded.charAt(0).toUpperCase() + decoded.slice(1) : 'Home'
}

function label(segment?: string) {
  return segment ? labels[segment.toLowerCase()] || humanize(segment) : undefined
}

export function formatAppPageTitle({ section, detail }: AppPageTitle) {
  const cleanSection = section.trim() || 'Home'
  const cleanDetail = detail?.trim()
  const title = cleanDetail && cleanDetail.toLocaleLowerCase() !== cleanSection.toLocaleLowerCase()
    ? `${cleanSection}${PAGE_TITLE_FORMAT.separator}${cleanDetail}`
    : cleanSection
  if (title.length <= PAGE_TITLE_FORMAT.maxLength) return title
  return `${title.slice(0, PAGE_TITLE_FORMAT.maxLength - 1).trimEnd()}…`
}

/** Provides a safe title for every authenticated organization route without exposing raw IDs. */
export function resolveAppPageTitle(pathname: string): AppPageTitle {
  const parts = pathname.split('/').filter(Boolean)
  const orgIndex = parts.indexOf('orgs')
  const route = orgIndex >= 0 ? parts.slice(orgIndex + 2) : parts
  if (!route.length) return { section: 'Home' }

  if (route[0] === 'admin') {
    const feature = label(route[1]) || 'Dashboard'
    const staticDetail = route.slice(2).find(part => labels[part.toLowerCase()])
    return { section: 'Admin', detail: staticDetail ? `${feature} · ${label(staticDetail)}` : feature }
  }

  const section = label(route[0]) || humanize(route[0])
  if (route[0] === 'portfolio') return { section, detail: label(route[1]) }
  if (route[0] === 'user') return { section: 'Profile', detail: label(route[2]) }
  if (route[0] === 'account') return { section, detail: label(route[1]) }
  if (['badges', 'plans', 'store'].includes(route[0])) {
    const detail = route.slice(1).find(part => labels[part.toLowerCase()])
    return { section, detail: label(detail) }
  }
  if (['community', 'organization', 'playground', 'podcast', 'resource'].includes(route[0])) return { section }
  return { section, detail: label(route[1]) }
}
