import assert from 'node:assert/strict'
import test from 'node:test'

import { reviewTally } from '../reviewTally.ts'

test('sending work back counts as reviewed, never as done', () => {
  assert.equal(reviewTally({}, 2), '0 of 2 reviewed')
  assert.equal(reviewTally({ a: 'flag' }, 1), '1 of 1 reviewed · 1 sent back')
  assert.equal(reviewTally({ a: 'confirm', b: 'flag' }, 3), '2 of 3 reviewed · 1 sent back')
  assert.equal(reviewTally({ a: 'confirm' }, 1), '1 of 1 reviewed')
})
