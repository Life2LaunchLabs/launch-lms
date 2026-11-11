import assert from 'node:assert/strict'
import test from 'node:test'

import { oauthErrorCode, oauthErrorMessage } from '../errors.ts'

const FALLBACK = 'The request could not be completed.'

test('shows the message of a {code, message} detail, never [object Object]', () => {
  const body = { detail: { code: 'test_persona_blocked', message: "Test personas can't do this." } }
  assert.equal(oauthErrorMessage(body), "Test personas can't do this.")
  assert.equal(oauthErrorCode(body), 'test_persona_blocked')
})

test('falls back to a plain sentence when the detail object has no message', () => {
  assert.equal(oauthErrorMessage({ detail: { code: 'nope' } }), FALLBACK)
  assert.equal(oauthErrorMessage({ detail: {} }), FALLBACK)
})

test('keeps RFC 6749 error_description and string details', () => {
  const body = { error: 'invalid_client', error_description: 'Unknown client.' }
  assert.equal(oauthErrorMessage(body), 'Unknown client.')
  assert.equal(oauthErrorCode(body), 'invalid_client')
  assert.equal(oauthErrorMessage({ detail: 'Not signed in.' }), 'Not signed in.')
})

test('uses the first validation message from a detail list', () => {
  assert.equal(oauthErrorMessage({ detail: [{ loc: ['body'], msg: 'Field required' }] }), 'Field required')
  assert.equal(oauthErrorMessage({ detail: [] }), FALLBACK)
})

test('falls back for empty or non-object bodies', () => {
  for (const body of [{}, null, undefined, 'oops', { detail: '  ' }]) {
    assert.equal(oauthErrorMessage(body), FALLBACK)
  }
})
