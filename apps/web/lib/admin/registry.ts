import type { PlanLevel } from '../../services/plans/plans.ts'
import { routePaths } from '../../services/routing/paths.ts'

/**
 * The one list of admin tabs and Home widgets. The sidebar, the mobile menu, page titles and the
 * Home page all read it, and each entry says what it needs: a resolved org feature, a role right
 * ("resource.action", as in the session's role rights) and/or a minimum plan.
 */
export type AdminRequirement = { feature?: string; right?: string; plan?: PlanLevel }

export type AdminTabId = 'home' | 'assignments' | 'people' | 'templates' | 'badges' | 'insights' | 'content' | 'organization'

export type AdminNavItem = {
  id: string
  label: string
  href: string
  requires: AdminRequirement
  /**
   * Paths this entry owns, matched on whole segments; a trailing slash claims everything below.
   * The longest match wins, so `/admin/plans/requirements` beats `/admin/plans/`.
   */
  match: string[]
  /** Match the paths exactly, not the pages below them. */
  exact?: boolean
  children?: AdminNavItem[]
}

export type AdminTab = AdminNavItem & { id: AdminTabId }

const admin = routePaths.org.admin
const STAFF = 'dashboard.action_access'

export const ADMIN_TABS: AdminTab[] = [
  { id: 'home', label: 'Home', href: admin.root(), match: [admin.root()], exact: true, requires: { right: STAFF } },
  {
    id: 'assignments',
    label: 'Assignments',
    href: admin.assignments(),
    match: [admin.assignments(), '/admin/plans/review', '/admin/plans/live'],
    requires: { right: STAFF, feature: 'managed_plans' },
  },
  { id: 'people', label: 'People', href: admin.people.root(), match: [admin.people.root()], requires: { right: STAFF } },
  {
    id: 'templates',
    label: 'Plan templates',
    href: admin.templates(),
    // Every other /admin/plans/<uuid> page is a template.
    match: ['/admin/plans/'],
    requires: { right: 'learning_activities.action_update' },
  },
  {
    id: 'badges',
    label: 'Badges',
    href: admin.badges(),
    match: [admin.badges()],
    requires: { right: 'badges.action_update' },
    children: [
      { id: 'collections', label: 'Collections', href: admin.badges(), match: [], requires: {} },
      { id: 'marketplace', label: 'Marketplace', href: admin.badgeMarketplace(), match: [], requires: {} },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    href: admin.insights(),
    match: [admin.insights()],
    requires: { right: 'users.action_read', feature: 'managed_plans' },
  },
  {
    id: 'content',
    label: 'Content',
    href: admin.content.resources(),
    match: [],
    requires: { right: 'organizations.action_read' },
    children: [
      { id: 'resources', label: 'Resources', href: admin.content.resources(), match: [admin.content.resources()], requires: { feature: 'resources' } },
      { id: 'podcasts', label: 'Podcasts', href: admin.content.podcasts(), match: [admin.content.podcasts()], requires: { feature: 'podcasts' } },
      { id: 'playgrounds', label: 'Playgrounds', href: admin.content.playgrounds(), match: [admin.content.playgrounds()], requires: { feature: 'playgrounds' } },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    href: admin.organization.general(),
    match: ['/admin/org/'],
    requires: { right: 'organizations.action_read' },
    children: [
      { id: 'general', label: 'General', href: admin.organization.general(), match: [admin.organization.general()], requires: {} },
      { id: 'branding', label: 'Branding', href: admin.organization.branding(), match: [admin.organization.branding()], requires: {} },
      { id: 'sso', label: 'Single Sign-On', href: admin.organization.sso(), match: [admin.organization.sso()], requires: { feature: 'sso' } },
      { id: 'plan', label: 'Plan & Packages', href: admin.organization.plan(), match: [admin.organization.plan()], requires: {} },
      { id: 'payments', label: 'Payments', href: admin.payments.overview(), match: ['/admin/payments'], requires: { feature: 'payments', plan: 'full' } },
    ],
  },
]

export function adminTab(id: AdminTabId): AdminTab {
  return ADMIN_TABS.find((tab) => tab.id === id)!
}

export type AdminWidgetId = 'content-overview' | 'recent-badges' | 'recent-members'
export type AdminWidget = { id: AdminWidgetId; label: string; requires: AdminRequirement }

/** Home widgets, in page order. */
export const ADMIN_HOME_WIDGETS: AdminWidget[] = [
  { id: 'content-overview', label: 'Overview', requires: { right: 'organizations.action_read' } },
  { id: 'recent-badges', label: 'Recent badges', requires: { right: 'badges.action_update' } },
  { id: 'recent-members', label: 'Recent members', requires: { right: 'users.action_read' } },
]

// Mirrors PACKAGE_FEATURE_MAP in apps/api/src/security/features_utils/packs.py: the package to request per feature.
export const FEATURE_PACKAGES: Record<string, string> = {
  analytics: 'analytics',
  badge_issuing: 'credentials',
  ai: 'ai',
  usergroups: 'advanced_user_management',
  roles: 'advanced_user_management',
  api_tokens: 'advanced_user_management',
  marketplace_publishing: 'badge_creation',
}

export const PACKAGE_LABELS: Record<string, string> = {
  analytics: 'Analytics',
  credentials: 'Credentials',
  ai: 'AI Features',
  advanced_user_management: 'Advanced User Management',
  badge_creation: 'Badge Publishing',
}

export type AccessRequest = { type: 'plan_upgrade' | 'package_add'; value: string }

/* eslint-disable no-unused-vars -- parameter names in a type document the callbacks */
export type AdminAccess = {
  planAtLeast(plan: PlanLevel): boolean
  can(right: string): boolean
  has(feature: string): boolean
  /** What would unlock a feature that is off, or null when nothing can be requested (an admin turned it off, or it is not in this release). */
  unlockFor(feature: string): AccessRequest | null
}
/* eslint-enable no-unused-vars */

export type ResolvedFeature = { enabled?: boolean; required_plan?: PlanLevel | null }

/** From the org's resolved feature: the plan it needs, else the package that turns it on, else nothing to request. */
export function featureUnlock(feature: string, resolved: ResolvedFeature | undefined, packages: string[], planAtLeast: AdminAccess['planAtLeast']): AccessRequest | null {
  if (!resolved || resolved.enabled) return null
  if (resolved.required_plan && !planAtLeast(resolved.required_plan)) return { type: 'plan_upgrade', value: resolved.required_plan }
  const pkg = FEATURE_PACKAGES[feature]
  return pkg && !packages.includes(pkg) ? { type: 'package_add', value: pkg } : null
}

export type AdminVisibility = { state: 'open' } | { state: 'locked'; request: AccessRequest } | { state: 'hidden' }

/** Rights hide an entry outright; a plan or package the org could request shows it locked. */
export function adminVisibility(requires: AdminRequirement, access: AdminAccess): AdminVisibility {
  if (requires.right && !access.can(requires.right)) return { state: 'hidden' }
  const featureRequest = requires.feature && !access.has(requires.feature) ? access.unlockFor(requires.feature) : undefined
  // A feature nobody can request (switched off, or not in this release) hides the entry even when the plan is short too.
  if (featureRequest === null) return { state: 'hidden' }
  if (requires.plan && !access.planAtLeast(requires.plan)) return { state: 'locked', request: { type: 'plan_upgrade', value: requires.plan } }
  return featureRequest ? { state: 'locked', request: featureRequest } : { state: 'open' }
}

export type VisibleNavItem = Omit<AdminNavItem, 'children'> & { visibility: Exclude<AdminVisibility, { state: 'hidden' }>; children?: VisibleNavItem[] }

/**
 * The tabs this viewer gets. A tab with children shows when any child does, opens on its first
 * open child, and is locked only when every child is.
 */
export function visibleAdminTabs(access: AdminAccess, tabs: AdminNavItem[] = ADMIN_TABS): VisibleNavItem[] {
  const result: VisibleNavItem[] = []
  for (const { children: entries, ...tab } of tabs) {
    const visibility = adminVisibility(tab.requires, access)
    if (visibility.state === 'hidden') continue
    if (!entries) {
      result.push({ ...tab, visibility })
      continue
    }
    const children = visibleAdminTabs(access, entries)
    if (!children.length) continue
    const firstOpen = children.find((child) => child.visibility.state === 'open')
    result.push({
      ...tab,
      href: (firstOpen || children[0]).href,
      visibility: visibility.state === 'locked' || firstOpen ? visibility : children[0].visibility,
      children,
    })
  }
  return result
}

function matchLength(pattern: string, path: string, exact?: boolean): number {
  if (exact) return path === pattern ? pattern.length : -1
  if (pattern.endsWith('/')) return path.startsWith(pattern) ? pattern.length : -1
  return path === pattern || path.startsWith(`${pattern}/`) ? pattern.length : -1
}

/** The tab (and child) that owns an admin path, by the longest match. Accepts internal /orgs/<slug>/ paths. */
export function adminTabForPath(pathname: string, tabs: AdminNavItem[] = ADMIN_TABS): { tab: AdminNavItem; child?: AdminNavItem } | null {
  const path = pathname.replace(/^\/orgs\/[^/]+/, '').split('?')[0].replace(/(.)\/$/, '$1')
  let best: { tab: AdminNavItem; child?: AdminNavItem; length: number } | null = null
  for (const tab of tabs) {
    for (const pattern of tab.match) {
      const length = matchLength(pattern, path, tab.exact)
      if (length > (best?.length ?? -1)) best = { tab, length }
    }
    for (const child of tab.children || []) {
      for (const pattern of child.match) {
        const length = matchLength(pattern, path, child.exact)
        if (length > (best?.length ?? -1)) best = { tab, child, length }
      }
    }
  }
  return best ? { tab: best.tab, child: best.child } : null
}
