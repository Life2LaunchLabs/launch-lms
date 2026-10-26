import type { AccessRequest, FeatureAccess } from '../../services/plans/plans.ts'
import { routePaths } from '../../services/routing/paths.ts'
import type { HomeSectionId } from '../../services/goals/adminHome.ts'

/**
 * The one list of admin tabs and Home widgets. The sidebar, the mobile menu, page titles and the
 * Home page all read it, and each entry says what it needs: an org access feature and/or a role
 * right ("resource.action", as in the session's role rights).
 */
export type AdminRequirement = { feature?: string; right?: string }

export type AdminTabId = 'home' | 'plans' | 'people' | 'insights' | 'resources' | 'organization'
export type { PlansTabId } from '../../services/routing/paths.ts'

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
  /** A short pill beside the label in the sidebar (e.g. "New"). */
  pill?: string
  /** The children are tabs on the page, not entries in the sidebar or mobile menu. */
  inPageTabs?: boolean
  children?: AdminNavItem[]
}

export type AdminTab = AdminNavItem & { id: AdminTabId }

const admin = routePaths.org.admin
const STAFF = 'dashboard.action_access'

export const ADMIN_TABS: AdminTab[] = [
  { id: 'home', label: 'Home', labelKey: 'common.home', href: admin.root(), match: [admin.root()], exact: true, requires: { right: STAFF } },
  {
    id: 'plans',
    label: 'Plans',
    href: admin.plans(),
    pill: 'New',
    // Plans, Discover, Assignments and Requirements are tabs inside Plans, not sidebar entries.
    inPageTabs: true,
    match: [],
    requires: { right: STAFF },
    children: [
      // Every other /admin/plans/<uuid> page is a plan.
      { id: 'plans', label: 'Plans', href: admin.plans('plans'), match: [admin.plans('plans'), '/admin/plans/'], requires: {} },
      { id: 'discover', label: 'Discover', href: admin.plans('discover'), match: [admin.plans('discover')], requires: {} },
      // Every org, free included, can assign its plans (a solo coach assigning to a client).
      { id: 'assignments', label: 'Assignments', labelKey: 'common.assignments', href: admin.plans('assignments'), match: [admin.plans('assignments'), '/admin/plans/review', '/admin/plans/live'], requires: {} },
      { id: 'requirements', label: 'Requirements', href: admin.plans('requirements'), match: [admin.plans('requirements')], requires: {} },
    ],
  },
  // Threads took over People: profiles still live under /admin/users.
  { id: 'people', label: 'Threads', href: admin.threads.root(), match: [admin.threads.root(), '/admin/users'], requires: { right: STAFF } },
  {
    id: 'insights',
    label: 'Insights',
    href: admin.insights(),
    match: [admin.insights()],
    requires: { right: 'users.action_read' },
  },
  // Any staff member adds the resources their org uses; listing a channel in the Library is the resource partner program.
  { id: 'resources', label: 'Resources', labelKey: 'common.resources', href: admin.resources.root(), match: [admin.resources.root()], requires: { right: STAFF } },
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
      { id: 'discover', label: 'Learner Discover', href: admin.organization.discover(), match: [admin.organization.discover()], requires: {} },
      { id: 'messaging', label: 'Messaging', href: admin.organization.messaging(), match: [admin.organization.messaging()], requires: {} },
      { id: 'sso', label: 'Single Sign-On', labelKey: 'dashboard.organization.settings.tabs.sso', href: admin.organization.sso(), match: [admin.organization.sso()], requires: { feature: 'sso' } },
      { id: 'plan', label: 'Plan & access', href: admin.organization.plan(), match: [admin.organization.plan()], requires: {} },
      { id: 'payments', label: 'Payments', labelKey: 'common.payments', href: admin.payments.overview(), match: ['/admin/payments'], requires: { feature: 'payments' } },
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

/** Home's sections as Customize lists them, in page order. `GET /goal-admin/home` says which ones a viewer gets. */
export const HOME_SECTIONS: Array<{ id: HomeSectionId; label: string; description: string }> = [
  { id: 'needs', label: 'Needs you', description: 'Threads with something waiting on you.' },
  { id: 'assignments', label: 'Your assignments', description: 'Where learners are on the assignments you’re on.' },
  { id: 'continue', label: 'Continue', description: 'Plans, requirements and resources edited last.' },
  { id: 'week', label: 'This week', description: 'Steps closing and stages opening on your assignments.' },
  { id: 'glance', label: 'At a glance', description: 'Insight cards you pinned.' },
  { id: 'requirements', label: 'Requirements', description: 'How learners are doing on each requirement framework.' },
]

export type { AccessRequest }

/* eslint-disable no-unused-vars -- parameter names in a type document the callbacks */
export type AdminAccess = {
  can(right: string): boolean
  has(feature: string): boolean
  /** What the org could request to turn a feature on, or null when nothing can (a legacy feature, or one the org has). */
  unlockFor(feature: string): AccessRequest | null
}
/* eslint-enable no-unused-vars */

/** The request that would turn a feature on, from the org's access. */
export function featureUnlock(access: FeatureAccess | undefined): AccessRequest | null {
  return access && !access.enabled ? access.unlock : null
}

export type AdminVisibility = { state: 'open' } | { state: 'locked'; request: AccessRequest } | { state: 'hidden' }

/** Rights hide an entry outright; a tier, program or feature the org could request shows it locked. */
export function adminVisibility(requires: AdminRequirement, access: AdminAccess): AdminVisibility {
  if (requires.right && !access.can(requires.right)) return { state: 'hidden' }
  if (!requires.feature || access.has(requires.feature)) return { state: 'open' }
  const request = access.unlockFor(requires.feature)
  // A feature nobody can request (a legacy feature) hides the entry.
  return request ? { state: 'locked', request } : { state: 'hidden' }
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
