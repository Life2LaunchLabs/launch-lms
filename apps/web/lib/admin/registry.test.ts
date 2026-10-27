import assert from 'node:assert/strict'
import test from 'node:test'
import type { FeatureAccess } from '../../services/plans/plans.ts'
import {
  adminLabel,
  adminTabForPath,
  adminVisibility,
  featureUnlock,
  visibleAdminTabs,
  type AdminAccess,
} from './registry.ts'

const on: FeatureAccess = { enabled: true, unlock: null }
const tier = (value: string): FeatureAccess => ({ enabled: false, unlock: { type: 'tier_upgrade', value } })
const partner = (value: string): FeatureAccess => ({ enabled: false, unlock: { type: 'partner_application', value } })

// Legacy features never reach the web, so a missing feature is one nobody can turn on.
function access({ rights = [], features = {}, superadmin = false }: {
  rights?: string[]
  features?: Record<string, FeatureAccess>
  superadmin?: boolean
}): AdminAccess {
  return {
    can: (right) => superadmin || rights.includes(right),
    has: (feature) => features[feature]?.enabled === true,
    unlockFor: (feature) => featureUnlock(features[feature]),
  }
}

const STAFF = 'dashboard.action_access'
const ADMIN_RIGHTS = [STAFF, 'learning_activities.action_update', 'badges.action_update', 'users.action_read', 'organizations.action_read']
const FULL_FEATURES: Record<string, FeatureAccess> = {
  groups: on,
  resource_publishing: partner('resource_partner'),
  sso: tier('enterprise'),
  payments: { enabled: false, unlock: { type: 'feature_request', value: 'payments' } },
}
const ids = (items: { id: string }[]) => items.map((item) => item.id)

test('a teacher (staff without admin rights) gets Home, Plans (with its four tabs), People, Resources and Opportunities', () => {
  const tabs = visibleAdminTabs(access({ rights: [STAFF], features: FULL_FEATURES }))
  assert.deepEqual(ids(tabs), ['home', 'plans', 'people', 'resources', 'opportunities'])
  const plans = tabs.find((tab) => tab.id === 'plans')!
  assert.deepEqual(ids(plans.children!), ['plans', 'discover', 'assignments', 'requirements'])
  assert.equal(plans.href, '/admin/plans')
  assert.equal(plans.inPageTabs, true)
  assert.equal(plans.pill, 'New')
})

test('an admin gets every tab in job order and gated pages show what to request', () => {
  const tabs = visibleAdminTabs(access({ rights: ADMIN_RIGHTS, features: FULL_FEATURES }))
  assert.deepEqual(ids(tabs), ['home', 'plans', 'people', 'insights', 'resources', 'opportunities', 'organization'])
  // Any staff member adds resources; only listing in the Library needs the resource partner program.
  assert.equal(tabs.find((tab) => tab.id === 'resources')!.visibility.state, 'open')
  const organization = tabs.find((tab) => tab.id === 'organization')!
  assert.deepEqual(ids(organization.children!), ['general', 'branding', 'discover', 'messaging', 'sso', 'plan', 'payments'])
  assert.deepEqual(organization.children!.find((child) => child.id === 'sso')!.visibility, { state: 'locked', request: { type: 'tier_upgrade', value: 'enterprise' } })
  assert.deepEqual(organization.children!.find((child) => child.id === 'payments')!.visibility, { state: 'locked', request: { type: 'feature_request', value: 'payments' } })
})

test('a free org gets every job tab open', () => {
  const tabs = visibleAdminTabs(access({ superadmin: true, features: { groups: tier('full'), sso: tier('enterprise') } }))
  for (const id of ['home', 'plans', 'people', 'insights']) {
    assert.equal(tabs.find((tab) => tab.id === id)!.visibility.state, 'open', id)
  }
})

test('labels translate through their existing keys and fall back to English', () => {
  const t = (key: string, { defaultValue }: { defaultValue: string }) => (key === 'dashboard.organization.settings.tabs.general' ? 'Allgemein' : defaultValue)
  const organization = visibleAdminTabs(access({ rights: ADMIN_RIGHTS, features: { ...FULL_FEATURES, payments: on } })).find((tab) => tab.id === 'organization')!
  assert.deepEqual(organization.children!.map((child) => adminLabel(t, child)), ['Allgemein', 'Branding', 'Learner Discover', 'Messaging', 'Single Sign-On', 'Plan & access', 'Payments'])
})

test('an enabled feature opens, and one nobody can turn on is hidden rather than requested', () => {
  assert.deepEqual(adminVisibility({ feature: 'groups' }, access({ features: FULL_FEATURES })), { state: 'open' })
  assert.deepEqual(adminVisibility({ feature: 'not_a_feature' }, access({ features: FULL_FEATURES })), { state: 'hidden' })
  assert.equal(featureUnlock(on), null)
})

test('paths resolve to the tab that owns them, by longest match', () => {
  const owner = (path: string) => {
    const match = adminTabForPath(path)
    return match ? [match.tab.id, match.child?.id].filter(Boolean).join('/') : null
  }
  assert.equal(owner('/admin'), 'home')
  assert.equal(owner('/orgs/acme/admin/'), 'home')
  assert.equal(owner('/admin/plans'), 'plans/plans')
  assert.equal(owner('/admin/plans/template_1/activity/a1'), 'plans/plans')
  assert.equal(owner('/admin/plans/badge/b1/routes'), 'plans/plans')
  assert.equal(owner('/admin/plans/collections/c1'), 'plans/plans')
  assert.equal(owner('/admin/plans/assignments'), 'plans/assignments')
  assert.equal(owner('/admin/plans/assignments/a1/learners'), 'plans/assignments')
  assert.equal(owner('/admin/plans/live/goal_1/reviews'), 'plans/assignments')
  assert.equal(owner('/admin/plans/review'), 'plans/assignments')
  assert.equal(owner('/admin/plans/requirements'), 'plans/requirements')
  assert.equal(owner('/admin/plans/requirements/fw_1/spec'), 'plans/requirements')
  assert.equal(owner('/admin/plans/discover'), 'plans/discover')
  assert.equal(owner('/admin/plans/discover/plan/goal_template_1'), 'plans/discover')
  assert.equal(owner('/admin/org/settings/discover'), 'organization/discover')
  assert.equal(owner('/admin/insights/evidence'), 'insights')
  assert.equal(owner('/admin/users/groups/2/members'), 'people')
  assert.equal(owner('/admin/threads/people/12'), 'people')
  assert.equal(owner('/admin/resources/channel/channel_1'), 'resources')
  assert.equal(owner('/admin/payments/offers'), 'organization/payments')
  assert.equal(owner('/admin/org/settings/sso'), 'organization/sso')
  assert.equal(owner('/admin/platform/users'), null)
  assert.equal(owner('/admin/plansx'), null)
})
