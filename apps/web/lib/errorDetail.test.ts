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

test('a refusal shows the server reason, and only retryable answers say try again (DEV-189)', async () => {
  const { refusalMessage } = await import('./errorDetail.ts')
  const sealed = { detail: { code: 'test_cohort_sealed', message: "Test personas and test orgs are sealed off from real people and orgs, so this can't be saved." } }
  assert.equal(refusalMessage(403, sealed), sealed.detail.message)
  assert.equal(refusalMessage(422, { detail: 'Enter your Canvas address.' }), 'Enter your Canvas address.')
  assert.equal(refusalMessage(422, { detail: [{ msg: 'Field required' }] }), 'Field required')
  assert.match(refusalMessage(403, {}), /isn’t allowed/)
  assert.doesNotMatch(refusalMessage(403, {}), /Try again in a moment/)
  assert.doesNotMatch(refusalMessage(409, {}), /Try again in a moment/)
  assert.match(refusalMessage(502, {}), /Try again in a moment/)
  assert.match(refusalMessage(429, null), /Try again in a moment/)
  assert.match(refusalMessage(0, null, 'Canvas didn’t answer'), /^Canvas didn’t answer\. Try again/)
})
