import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlanLevel } from '../../services/plans/plans.ts'
import {
  ADMIN_HOME_WIDGETS,
  adminLabel,
  adminTabForPath,
  adminVisibility,
  featureUnlock,
  visibleAdminTabs,
  type AdminAccess,
  type ResolvedFeature,
} from './registry.ts'

const ORDER: PlanLevel[] = ['free', 'full', 'enterprise']

function access({ plan = 'full', rights = [], features = {}, packages = [], superadmin = false }: {
  plan?: PlanLevel
  rights?: string[]
  features?: Record<string, ResolvedFeature>
  packages?: string[]
  superadmin?: boolean
}): AdminAccess {
  const planAtLeast = (required: PlanLevel) => plan === 'master' || ORDER.indexOf(plan) >= ORDER.indexOf(required)
  return {
    planAtLeast,
    can: (right) => superadmin || rights.includes(right),
    has: (feature) => features[feature]?.enabled === true,
    unlockFor: (feature) => featureUnlock(feature, features[feature], packages, planAtLeast),
  }
}

const STAFF = 'dashboard.action_access'
const ADMIN_RIGHTS = [STAFF, 'learning_activities.action_update', 'badges.action_update', 'users.action_read', 'organizations.action_read']
const FULL_FEATURES: Record<string, ResolvedFeature> = {
  managed_plans: { enabled: true },
  resources: { enabled: true },
  podcasts: { enabled: false },
  playgrounds: { enabled: false, required_plan: 'enterprise' },
  sso: { enabled: false, required_plan: 'enterprise' },
  payments: { enabled: false },
}
const ids = (items: { id: string }[]) => items.map((item) => item.id)

test('a teacher (staff without admin rights) gets Home, Assignments and People only', () => {
  const tabs = visibleAdminTabs(access({ rights: [STAFF], features: FULL_FEATURES }))
  assert.deepEqual(ids(tabs), ['home', 'assignments', 'people'])
  assert.deepEqual(ids(ADMIN_HOME_WIDGETS.filter((widget) => adminVisibility(widget.requires, access({ rights: [STAFF] })).state !== 'hidden')), [])
})

test('an admin gets every tab in job order, with each tab opening its first available page', () => {
  const tabs = visibleAdminTabs(access({ rights: ADMIN_RIGHTS, features: FULL_FEATURES }))
  assert.deepEqual(ids(tabs), ['home', 'assignments', 'people', 'templates', 'badges', 'insights', 'content', 'organization'])
  const content = tabs.find((tab) => tab.id === 'content')!
  // Podcasts are off with nothing to request; playgrounds need a plan the org can ask for.
  assert.deepEqual(ids(content.children!), ['resources', 'playgrounds'])
  assert.equal(content.href, '/admin/resources')
  assert.deepEqual(content.children![1].visibility, { state: 'locked', request: { type: 'plan_upgrade', value: 'enterprise' } })
  const organization = tabs.find((tab) => tab.id === 'organization')!
  assert.deepEqual(ids(organization.children!), ['general', 'branding', 'sso', 'plan'])
})

test('a free org gets every job tab open; plan-gated pages show locked with the plan to request', () => {
  const free = access({ plan: 'free', superadmin: true, features: { managed_plans: { enabled: false, required_plan: 'full' }, sso: { enabled: false, required_plan: 'enterprise' } } })
  const tabs = visibleAdminTabs(free)
  for (const id of ['home', 'assignments', 'people', 'templates', 'insights']) {
    assert.equal(tabs.find((tab) => tab.id === id)!.visibility.state, 'open', id)
  }
  const sso = tabs.find((tab) => tab.id === 'organization')!.children!.find((child) => child.id === 'sso')!
  assert.deepEqual(sso.visibility, { state: 'locked', request: { type: 'plan_upgrade', value: 'enterprise' } })
})

test('labels translate through their existing keys and fall back to English', () => {
  const t = (key: string, { defaultValue }: { defaultValue: string }) => (key === 'dashboard.organization.settings.tabs.general' ? 'Allgemein' : defaultValue)
  const organization = visibleAdminTabs(access({ rights: ADMIN_RIGHTS, features: FULL_FEATURES })).find((tab) => tab.id === 'organization')!
  assert.deepEqual(organization.children!.map((child) => adminLabel(t, child)), ['Allgemein', 'Branding', 'Single Sign-On', 'Plan & Packages'])
})

test('package features ask for their package, and a feature switched off is hidden rather than requested', () => {
  const full = (packages: string[]) => access({ rights: ADMIN_RIGHTS, packages, features: { analytics: { enabled: false, required_plan: 'full' }, communities: { enabled: false } } })
  assert.deepEqual(adminVisibility({ feature: 'analytics' }, full([])), { state: 'locked', request: { type: 'package_add', value: 'analytics' } })
  // The package is on but an admin turned analytics off: nothing to request.
  assert.deepEqual(adminVisibility({ feature: 'analytics' }, full(['analytics'])), { state: 'hidden' })
  assert.deepEqual(adminVisibility({ feature: 'communities' }, full([])), { state: 'hidden' })
  // A plan requirement never resurrects a feature nobody can request.
  assert.deepEqual(adminVisibility({ feature: 'payments', plan: 'enterprise' }, access({ features: { payments: { enabled: false } } })), { state: 'hidden' })
})

test('paths resolve to the tab that owns them, by longest match', () => {
  const owner = (path: string) => {
    const match = adminTabForPath(path)
    return match ? [match.tab.id, match.child?.id].filter(Boolean).join('/') : null
  }
  assert.equal(owner('/admin'), 'home')
  assert.equal(owner('/orgs/acme/admin/'), 'home')
  assert.equal(owner('/admin/plans'), 'assignments')
  assert.equal(owner('/admin/plans/live/goal_1/reviews'), 'assignments')
  assert.equal(owner('/admin/plans/templates'), 'templates')
  assert.equal(owner('/admin/plans/template_1/activity/a1'), 'templates')
  assert.equal(owner('/admin/plans/requirements/fw_1/spec'), 'insights')
  assert.equal(owner('/admin/users/groups/2/members'), 'people')
  assert.equal(owner('/admin/badges/collection/c1/badges'), 'badges')
  assert.equal(owner('/admin/resources/tags'), 'content/resources')
  assert.equal(owner('/admin/payments/offers'), 'organization/payments')
  assert.equal(owner('/admin/org/settings/sso'), 'organization/sso')
  assert.equal(owner('/admin/platform/users'), null)
  assert.equal(owner('/admin/plansx'), null)
})
