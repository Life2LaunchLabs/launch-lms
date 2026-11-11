import assert from 'node:assert/strict'
import test from 'node:test'

import { parsePersonaLines } from '../personaLines.ts'

test('a line prefix picks where the persona starts', () => {
  const [dana, robin, kim, sam] = parsePersonaLines([
    'owner: Dana Reyes | Runs a summer camp',
    'new: Robin | Just signed up from the front page',
    'Creator: Kim Lee | Wants to set up her training team',
    'Sam | An existing learner',
  ].join('\n'))
  assert.equal(dana.start_state, 'org_owner')
  assert.equal(robin.start_state, 'new_signup')
  assert.deepEqual(kim, { first_name: 'Kim', last_name: 'Lee', brief: 'Wants to set up her training team', start_state: 'org_creator' })
  assert.equal(sam.start_state, 'has_account')
})
