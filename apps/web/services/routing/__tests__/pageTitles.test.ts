import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAppPageTitle, resolveAppPageTitle } from '../pageTitles.ts'

test('formats feature and entity titles from one convention', () => {
  assert.equal(formatAppPageTitle({ section: 'Plans', detail: 'SB3 Journey' }), 'Plans | SB3 Journey')
  assert.equal(formatAppPageTitle({ section: 'Coach', detail: 'Coach' }), 'Coach')
  assert.equal(formatAppPageTitle({ section: 'Plans', detail: 'x'.repeat(100) }).length, 80)
})

test('covers learner routes without exposing dynamic identifiers', () => {
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/discover'), { section: 'Discover', detail: undefined })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/portfolio/projects/5b128134-5dc2'), { section: 'Portfolio', detail: 'Projects' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/plans/sb3-journey'), { section: 'Goals', detail: undefined })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/badges'), { section: 'Discover', detail: undefined })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/account/notifications'), { section: 'Account', detail: 'Notifications' })
})

test('titles admin pages by the registry tab that owns them', () => {
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin'), { section: 'Admin', detail: 'Home' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/plans'), { section: 'Admin', detail: 'Plans · Assignments' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/plans/review'), { section: 'Admin', detail: 'Plans · Assignments' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/plans/template_1/settings'), { section: 'Admin', detail: 'Plans · Templates' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/badges/badge/b1/routes'), { section: 'Admin', detail: 'Plans · Badges' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/plans/requirements/fw_1/spec'), { section: 'Admin', detail: 'Plans · Requirements' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/plans/marketplace'), { section: 'Admin', detail: 'Plans · Marketplace' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/insights'), { section: 'Admin', detail: 'Insights' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/users'), { section: 'Admin', detail: 'People' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/org/settings/branding'), { section: 'Admin', detail: 'Organization · Branding' })
})

test('keeps admin pages outside the tabs on the segment labels', () => {
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/platform/users'), { section: 'Admin', detail: 'Platform · Users' })
})
