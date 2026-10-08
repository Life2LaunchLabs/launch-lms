import { getCoreCapabilities, routePaths } from '@services/config/config'

export type PlatformSection = 'overview' | 'organizations' | 'users' | 'requests' | 'feedback' | 'demo' | 'settings' | 'news'

const paths = routePaths.owner.platform

// The one list of platform pages. The top tabs, the sidebar and the mobile menu all
// render it, each pairing an icon per section, so a new page shows up in every place.
const SECTIONS: { id: PlatformSection; label: string; href: string; exact?: boolean; requiresNews?: boolean }[] = [
  { id: 'overview', label: 'Overview', href: paths.overview(), exact: true },
  { id: 'organizations', label: 'Organizations', href: paths.organizations() },
  { id: 'users', label: 'Users', href: paths.users() },
  { id: 'requests', label: 'Requests', href: paths.requests() },
  { id: 'feedback', label: 'Tester feedback', href: paths.feedback() },
  { id: 'demo', label: 'Demo', href: paths.demo() },
  { id: 'settings', label: 'Settings', href: paths.settings() },
  { id: 'news', label: 'News', href: paths.news(), requiresNews: true },
]

export function platformSections() {
  const news = getCoreCapabilities().news
  return SECTIONS.filter((section) => !section.requiresNews || news)
}
