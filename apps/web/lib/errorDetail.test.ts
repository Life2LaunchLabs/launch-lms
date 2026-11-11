import assert from 'node:assert/strict'
import test from 'node:test'

import { errorDetailMessage } from './errorDetail.ts'

test('a {code, message} detail shows its message, never [object Object] (FEED-53)', () => {
  const sealed = {
    detail: {
      code: 'test_cohort_sealed',
      message: "Test personas and test orgs are sealed off from real people and orgs, so this can't be saved.",
      table: 'userorganization',
    },
  }
  assert.equal(errorDetailMessage(sealed, 'Unable to complete signup'), sealed.detail.message)
  assert.notEqual(String(errorDetailMessage(sealed)), '[object Object]')
})

test('string details and OAuth descriptions pass through', () => {
  assert.equal(errorDetailMessage({ detail: 'Email already exists' }), 'Email already exists')
  assert.equal(errorDetailMessage({ error: 'invalid_client', error_description: 'Unknown client.' }), 'Unknown client.')
})

test('validation lists show the first message', () => {
  assert.equal(errorDetailMessage({ detail: [{ loc: ['body', 'email'], msg: 'Field required' }] }), 'Field required')
  assert.equal(errorDetailMessage({ detail: [] }, 'Nope'), 'Nope')
})

test('empty, odd or unreadable bodies use the fallback', () => {
  for (const body of [null, undefined, {}, 'oops', { detail: '  ' }, { detail: { code: 'x' } }]) {
    assert.equal(errorDetailMessage(body, 'Unable to load onboarding'), 'Unable to load onboarding')
  }
  assert.equal(errorDetailMessage(null), 'The request could not be completed.')
})
