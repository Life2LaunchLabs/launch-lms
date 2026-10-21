import assert from 'node:assert/strict'
import test from 'node:test'
import { arrangePlansTabs, isPlansTab, movePlansTab, PLANS_TAB_IDS } from './plansTabs.ts'

const CREATOR = ['badges', 'templates', 'assignments', 'requirements', 'marketplace'] as const

test('the saved order comes first, then tabs never placed in the default order', () => {
  assert.deepEqual(arrangePlansTabs(null), [...PLANS_TAB_IDS])
  assert.deepEqual(arrangePlansTabs(null, [...CREATOR]), [...CREATOR])
  assert.deepEqual(arrangePlansTabs(['marketplace', 'weather', 'badges', 'marketplace'], [...CREATOR]), ['marketplace', 'badges', 'templates', 'assignments', 'requirements'])
  // A default missing a tab still shows every tab.
  assert.deepEqual(arrangePlansTabs([], ['badges']), ['badges', 'assignments', 'templates', 'requirements', 'marketplace'])
})

test('moving stops at either end', () => {
  const order = arrangePlansTabs(null)
  assert.deepEqual(movePlansTab(order, 'badges', -1), ['assignments', 'badges', 'templates', 'requirements', 'marketplace'])
  assert.deepEqual(movePlansTab(order, 'assignments', -1), order)
  assert.deepEqual(movePlansTab(order, 'marketplace', 1), order)
  assert.equal(isPlansTab('requirements'), true)
  assert.equal(isPlansTab('people'), false)
})
