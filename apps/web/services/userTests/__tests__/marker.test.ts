import assert from 'node:assert/strict'
import test from 'node:test'

import { encodeTestPersonaMarker, readTestPersonaCookie } from '../marker.ts'

const marker = { userId: 42, name: 'Dana O\'Neil: counselor', cohort: 'Riverside onboarding' }

test('reads the marker as the browser stores it after Next encodes it again', () => {
  const stored = encodeURIComponent(encodeTestPersonaMarker(marker))
  assert.deepEqual(readTestPersonaCookie(`a=1; launchlms_test_persona=${stored}; b=2`), marker)
})

test('reads a marker that was set without the second encoding', () => {
  assert.deepEqual(readTestPersonaCookie(`launchlms_test_persona=${encodeTestPersonaMarker(marker)}`), marker)
})

test('ignores a missing or broken marker', () => {
  assert.equal(readTestPersonaCookie('a=1'), null)
  assert.equal(readTestPersonaCookie('launchlms_test_persona=NaN%3Ax'), null)
})
