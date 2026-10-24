import assert from 'node:assert/strict'
import test from 'node:test'

import { needsVersionDecision } from '../versionStatus.ts'

test('an assignment needs a decision when a newer version is out', () => {
  assert.equal(needsVersionDecision({ version: 2, latest_version: 2, update_available: false }), false)
  assert.equal(needsVersionDecision({ version: 1, latest_version: 2, update_available: true }), true)
  assert.equal(needsVersionDecision({ version: 1, latest_version: 2, update_available: true, status: 'ended' }), false)
})
