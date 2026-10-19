import type { PlanLevel } from '../../services/plans/plans.ts'
import { routePaths } from '../../services/routing/paths.ts'
import type { HomeWidgetId } from '../../services/goals/adminHome.ts'

/**
 * The one list of admin tabs and Home widgets. The sidebar, the mobile menu, page titles and the
 * Home page all read it, and each entry says what it needs: a resolved org feature, a role right
 * ("resource.action", as in the session's role rights) and/or a minimum plan.
 */
export type AdminRequirement = { feature?: string; right?: string; plan?: PlanLevel }

export type AdminTabId = 'home' | 'assignments' | 'people' | 'templates' | 'badges' | 'insights' | 'content' | 'organization'

export type AdminNavItem = {
  id: string
  /** English label; used as the fallback and by page titles. */
  label: string
  /** Existing i18n key for the label, when there is one. Render with `adminLabel(t, item)`. */
  labelKey?: string
  href: string
  requires: AdminRequirement
  /**
   * Paths this entry owns, matched on whole segments; a trailing slash claims everything below.
   * The longest match wins, so `/admin/plans/review` beats `/admin/plans/`.
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
  { id: 'home', label: 'Home', labelKey: 'common.home', href: admin.root(), match: [admin.root()], exact: true, requires: { right: STAFF } },
  {
    id: 'assignments',
    label: 'Assignments',
    labelKey: 'common.assignments',
    href: admin.assignments(),
    match: [admin.assignments(), '/admin/plans/review', '/admin/plans/live'],
    // Every org, free included, can assign its templates (a solo coach assigning to a client).
    requires: { right: STAFF },
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
    requires: { right: 'users.action_read' },
  },
  {
    id: 'content',
    label: 'Content',
    href: admin.content.resources(),
    match: [],
    requires: { right: 'organizations.action_read' },
    children: [
      { id: 'resources', label: 'Resources', labelKey: 'common.resources', href: admin.content.resources(), match: [admin.content.resources()], requires: { feature: 'resources' } },
      { id: 'podcasts', label: 'Podcasts', labelKey: 'podcasts.podcasts', href: admin.content.podcasts(), match: [admin.content.podcasts()], requires: { feature: 'podcasts' } },
      { id: 'playgrounds', label: 'Playgrounds', labelKey: 'common.playgrounds', href: admin.content.playgrounds(), match: [admin.content.playgrounds()], requires: { feature: 'playgrounds' } },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    labelKey: 'common.organization',
    href: admin.organization.general(),
    match: ['/admin/org/'],
    requires: { right: 'organizations.action_read' },
    children: [
      { id: 'general', label: 'General', labelKey: 'dashboard.organization.settings.tabs.general', href: admin.organization.general(), match: [admin.organization.general()], requires: {} },
      { id: 'branding', label: 'Branding', labelKey: 'dashboard.organization.settings.tabs.branding', href: admin.organization.branding(), match: [admin.organization.branding()], requires: {} },
      { id: 'sso', label: 'Single Sign-On', labelKey: 'dashboard.organization.settings.tabs.sso', href: admin.organization.sso(), match: [admin.organization.sso()], requires: { feature: 'sso' } },
      { id: 'plan', label: 'Plan & Packages', href: admin.organization.plan(), match: [admin.organization.plan()], requires: {} },
      { id: 'payments', label: 'Payments', labelKey: 'common.payments', href: admin.payments.overview(), match: ['/admin/payments'], requires: { feature: 'payments', plan: 'full' } },
    ],
  },
]

/* eslint-disable no-unused-vars -- parameter names in a type document the callback */
type Translate = (key: string, options: { defaultValue: string }) => string
/* eslint-enable no-unused-vars */

/** The entry's label in the viewer's language, falling back to the English label. */
export function adminLabel(t: Translate, item: Pick<AdminNavItem, 'label' | 'labelKey'>): string {
  return item.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item.label
}

export function adminTab(id: AdminTabId): AdminTab {
  return ADMIN_TABS.find((tab) => tab.id === id)!
}

export type AdminWidgetId = HomeWidgetId
export type AdminWidget = { id: AdminWidgetId; label: string; description: string; requires: AdminRequirement }

/**
 * Home widgets, in default page order. `GET /goal-admin/home` says which ones a viewer gets (by what
 * they staff and what the org makes) and carries their data; these requirements hide or lock them
 * like the tabs. Each member reorders and hides them for themselves.
 */
export const ADMIN_HOME_WIDGETS: AdminWidget[] = [
  { id: 'waiting', label: 'Waiting on you', description: 'Work to review, grade or confirm, and chat reports.', requires: { right: STAFF } },
  { id: 'today', label: 'Today and upcoming', description: 'Steps closing and stages opening this week in the assignments you staff.', requires: { right: STAFF } },
  { id: 'messages', label: 'Recent messages', description: 'Your latest chats in this organization.', requires: { right: STAFF } },
  { id: 'attention', label: 'Assignments needing attention', description: 'Learners behind, overdue steps and work waiting on staff.', requires: { right: STAFF } },
  {
    id: 'creator',
    label: 'How your templates and badges do',
    description: 'Starts, completions and recent edits of what your org makes.',
    requires: { right: 'learning_activities.action_update', feature: 'analytics' },
  },
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
