import { routePaths } from './paths.ts'

const admin = routePaths.org.admin
const decode = (segment: string) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// /admin/users/<segment> used to hold settings tabs and bare usernames. These were tabs, not people.
const OLD_PEOPLE_TABS = new Set(['new', 'groups', 'grading', 'roles', 'signups', 'audit-logs', 'user', 'settings', 'cohorts'])
const RENAMED_GROUP_TABS: Record<string, string> = { programs: 'plans', users: 'members', reports: 'requirements' }
const RENAMED_USER_TABS: Record<string, string> = { assignments: 'plans', review: 'overview' }

function legacyAdminPath(parts: string[]): string | null {
  const [area, a, b, c, d] = parts
  const n = parts.length
  if (n === 0) return null

  if (area === 'analytics' || area === 'boards') return admin.root()
  if (area === 'feedback' && n === 1) return routePaths.owner.platform.feedback()
  if (area === 'org-management') {
    if (n === 1) return routePaths.owner.platform.organizations()
    if (a === 'users') return routePaths.owner.platform.users()
    if (a === 'analytics') return routePaths.owner.platform.overview()
    return routePaths.owner.platform.organization(a)
  }
  if (area === 'programs') {
    if (!a) return admin.templates()
    return admin.templatePage(decode(a), b && b !== 'assignments' ? decode(b) : 'overview')
  }

  if (area === 'plans') {
    if (a === 'reporting' && n === 2) return admin.insights()
    // Assignments now live in the Assignments tab; their old pages resolved them one by one.
    if (a === 'assignments') return admin.assignments()
    if (a === 'requirements' && n === 3) return admin.requirementFramework(decode(b), 'details')
    if (b === 'assignments' && c === 'new' && n === 4) return admin.templatePage(decode(a), 'overview')
    return null
  }

  if (area === 'users') {
    if (n === 2) return OLD_PEOPLE_TABS.has(a) ? admin.people.root() : admin.people.user(decode(a))
    if (a === 'settings') return admin.people.root()
    if (a === 'user' && n === 3) return admin.people.user(decode(b))
    if (a === 'user' && n === 4 && RENAMED_USER_TABS[c]) return admin.people.userPage(decode(b), RENAMED_USER_TABS[c])
    if (a === 'cohorts' && n === 3) return admin.people.group(decode(b))
    if (a === 'cohorts' && c === 'programs' && d) return admin.people.groupPlans(decode(b), decode(d))
    if (a === 'groups' && n === 3) return admin.people.group(decode(b))
    if (a === 'groups' && n === 4 && RENAMED_GROUP_TABS[c]) return admin.people.group(decode(b), RENAMED_GROUP_TABS[c])
    if (a === 'groups' && c === 'programs' && d) return admin.people.groupPlans(decode(b), decode(d))
    return null
  }

  if (area === 'badges') {
    if (a === 'marketplace' && n === 2) return admin.badgeMarketplace()
    if (a === 'badge' && n === 3) return admin.badge(decode(b), 'analytics')
    if (a === 'collection' && n === 3) return admin.badgeCollection(decode(b), 'badges')
    return null
  }

  if (area === 'resources' && n === 2 && a !== 'tags') return admin.content.resourceChannel(a, 'general')
  return null
}

/**
 * Old admin and dashboard URLs, kept for one release so bookmarks and sent links still land.
 * Returns the current path (with its own query, if any) or null when the path is not a legacy one.
 */
export function legacyRedirectPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'dash') {
    const rest = parts.slice(1)
    return legacyAdminPath(rest) ?? `/admin${rest.length ? `/${rest.join('/')}` : ''}`
  }
  if (parts[0] === 'admin') return legacyAdminPath(parts.slice(1))
  // Group plans are managed from the admin side now; staff land on their own plans.
  if (parts[0] === 'plans' && parts[1] === 'groups' && parts.length === 3) return routePaths.org.plans()
  return null
}
