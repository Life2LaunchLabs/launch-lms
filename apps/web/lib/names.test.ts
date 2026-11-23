import { test } from 'node:test'
import assert from 'node:assert/strict'

import { firstNameOf, greetingName, legalName, shownName } from './names.ts'

test('shownName prefers the name someone goes by', () => {
  assert.equal(shownName({ preferred_name: 'Lola', first_name: 'Dolores', last_name: 'Diaz', username: 'dd' }), 'Lola')
})

test('shownName falls back to the legal name, then the handle', () => {
  assert.equal(shownName({ preferred_name: ' ', first_name: 'Dolores', last_name: 'Diaz', username: 'dd' }), 'Dolores Diaz')
  assert.equal(shownName({ username: 'dd' }), 'dd')
  assert.equal(shownName(null), '')
  assert.equal(legalName({ first_name: 'Dolores' }), 'Dolores')
})

test('greetings keep a title with the name (DEV-204)', () => {
  assert.equal(greetingName({ preferred_name: 'Ms. Rivera', first_name: 'Ana' }), 'Ms. Rivera')
  assert.equal(greetingName({ first_name: 'Ms.', last_name: 'Rivera' }), 'Ms. Rivera')
  assert.equal(firstNameOf('Coach  Diaz'), 'Coach Diaz')
})

test('plain names greet by their first word', () => {
  assert.equal(greetingName({ preferred_name: 'Lola Diaz', first_name: 'Dolores' }), 'Lola')
  assert.equal(greetingName({ first_name: 'Mary Ann' }), 'Mary')
  assert.equal(firstNameOf('Miles Davis'), 'Miles')
  assert.equal(greetingName(null), '')
})
