import { routePaths, type FrameworkSubpage, type GroupView } from './paths.ts'

const admin = routePaths.org.admin
const decode = (segment: string) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// /admin/users/<segment> used to hold settings tabs and bare usernames. These were tabs, not people.
const OLD_PEOPLE_TABS = new Set(['new', 'groups', 'grading', 'roles', 'signups', 'audit-logs', 'user', 'settings', 'cohorts', 'chat'])
// A plan's old tabs, and the Plans sections whose second segment is not a plan.
const OLD_PLAN_TABS = new Set(['overview', 'objectives', 'assignments', 'settings', 'publish', 'versions'])
const PLANS_SECTIONS = new Set(['assignments', 'requirements', 'live', 'review', 'collections', 'discover', 'badge', 'marketplace', 'templates'])
// A group's requirement report (once "reports") moved to Insights.
const GROUP_EVIDENCE_TABS = new Set(['requirements', 'reports'])

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
    if (!a) return admin.plans()
    return admin.template(decode(a))
  }

  if (area === 'plans') {
    if (a === 'reporting' && n === 2) return admin.insights()
    // Requirements live under Plans again: a framework opens on its details.
    if (a === 'requirements' && n === 3) return admin.requirementFrameworkPlans(decode(b), 'details')
    if (b === 'assignments' && c === 'new' && n === 4) return admin.template(decode(a))
    // Plans was Templates; Discover was the Marketplace.
    if (a === 'templates' && n === 2) return admin.plans()
    if (a === 'marketplace') {
      if (n === 2) return admin.discover()
      if (b === 'plan' && n === 4) return admin.discoverPlan(decode(c))
      if (b === 'collection' && n === 4) return admin.discoverCollection(decode(c))
      return admin.discover()
    }
    // A badge's own admin pages are gone: the badge is a card on its plan.
    if (a === 'badge') return admin.plans()
    // A plan's old tabs are one page now.
    if (n === 3 && OLD_PLAN_TABS.has(b) && !PLANS_SECTIONS.has(a)) return admin.template(decode(a))
    return null
  }

  if (area === 'insights') {
    // Requirement frameworks moved from Insights to Plans › Requirements.
    if (a === 'frameworks' && n === 2) return admin.requirements()
    if (a === 'frameworks' && n === 3) return admin.requirementFrameworkPlans(decode(b), 'details')
    if (a === 'frameworks' && n === 4) return admin.requirementFrameworkPlans(decode(b), decode(c) as FrameworkSubpage)
    return null
  }

  if (area === 'users') {
    // People is one page: a person, a group or a chat opens beside the list, with no tabs of its own.
    if (n === 2) return OLD_PEOPLE_TABS.has(a) ? admin.people.root() : admin.people.user(decode(a))
    if (a === 'settings') return admin.people.root()
    if (a === 'user' && n === 4) return admin.people.user(decode(b))
    const group = (view?: GroupView, assignment?: string) => admin.people.group(decode(b), view, assignment && decode(assignment))
    if ((a === 'cohorts' || a === 'groups') && c === 'programs' && d) return group('plans', d)
    if (a === 'cohorts' && n >= 3) return group()
    if (a === 'groups' && n === 4 && GROUP_EVIDENCE_TABS.has(c)) return admin.insightsEvidence(decode(b))
    if (a === 'groups' && n >= 4) return c === 'plans' ? group('plans') : group()
    return null
  }

  if (area === 'badges') {
    // Badges are part of the plans that earn them; there is no Badges tab.
    if (a === 'marketplace') return admin.discover()
    return admin.plans()
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
  // A badge's old verify page: the award page is the verification now (and itself redirects to the award's short link).
  if (parts[0] === 'badges' && parts.length === 3 && parts[2] === 'verify') return `/badges/${parts[1]}`
  // Group plans are managed from the admin side now; staff land on their own plans.
  if (parts[0] === 'plans' && parts[1] === 'groups' && parts.length === 3) return routePaths.org.plans()
  return null
}
