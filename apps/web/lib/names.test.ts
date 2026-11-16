import { test } from 'node:test'
import assert from 'node:assert/strict'

import { legalName, shownName } from './names.ts'

test('shownName prefers the name someone goes by', () => {
  assert.equal(shownName({ preferred_name: 'Lola', first_name: 'Dolores', last_name: 'Diaz', username: 'dd' }), 'Lola')
})

test('shownName falls back to the legal name, then the handle', () => {
  assert.equal(shownName({ preferred_name: ' ', first_name: 'Dolores', last_name: 'Diaz', username: 'dd' }), 'Dolores Diaz')
  assert.equal(shownName({ username: 'dd' }), 'dd')
  assert.equal(shownName(null), '')
  assert.equal(legalName({ first_name: 'Dolores' }), 'Dolores')
})
