import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAppPageTitle, resolveAppPageTitle } from '../pageTitles.ts'

test('formats feature and entity titles from one convention', () => {
  assert.equal(formatAppPageTitle({ section: 'Plans', detail: 'SB3 Journey' }), 'Plans | SB3 Journey')
  assert.equal(formatAppPageTitle({ section: 'Hub', detail: 'Hub' }), 'Hub')
  assert.equal(formatAppPageTitle({ section: 'Plans', detail: 'x'.repeat(100) }).length, 80)
})

test('covers learner routes without exposing dynamic identifiers', () => {
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/hub'), { section: 'Hub', detail: undefined })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/portfolio/projects/5b128134-5dc2'), { section: 'Portfolio', detail: 'Projects' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/plans/sb3-journey'), { section: 'Plans', detail: undefined })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/account/notifications'), { section: 'Account', detail: 'Notifications' })
})

test('covers admin route families from the same resolver', () => {
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/plans/reporting'), { section: 'Admin', detail: 'Plans · Reporting' })
  assert.deepEqual(resolveAppPageTitle('/orgs/acme/admin/users'), { section: 'Admin', detail: 'Users' })
})
