import assert from 'node:assert/strict'
import test from 'node:test'

import { eligibilityLabel, needsVersionDecision } from '../versionStatus.ts'

test('an assignment needs a decision when a newer version is out or its badge no longer accepts its version', () => {
  assert.equal(needsVersionDecision({ version: 2, latest_version: 2, update_available: false, version_eligible: true }), false)
  assert.equal(needsVersionDecision({ version: 1, latest_version: 2, update_available: true, version_eligible: null }), true)
  assert.equal(needsVersionDecision({ version: 2, latest_version: 2, update_available: false, version_eligible: false }), true)
  assert.equal(needsVersionDecision({ version: 1, latest_version: 2, update_available: true, status: 'ended' }), false)
})

test("a badge owner's version rule reads plainly", () => {
  assert.equal(eligibilityLabel('any'), 'Every version earns the badge')
  assert.equal(eligibilityLabel('latest'), 'Only the newest version earns the badge')
  assert.equal(eligibilityLabel('from', 3), 'Version 3 and later earn the badge')
})
