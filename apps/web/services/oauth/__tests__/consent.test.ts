import assert from 'node:assert/strict'
import test from 'node:test'

import { returnLine } from '../consent.ts'

test('a local callback reads as this computer, not a bare address (FEED-107)', () => {
  assert.equal(returnLine('Claude', '127.0.0.1:8976'), 'Then you go back to Claude on this computer.')
  assert.equal(returnLine('Claude', 'localhost:6274'), 'Then you go back to Claude on this computer.')
})

test('a web callback still names its host', () => {
  assert.equal(returnLine('Claude', 'claude.ai'), 'Then you go back to Claude at claude.ai.')
  assert.equal(returnLine('Claude', 'localhost.evil.example'), 'Then you go back to Claude at localhost.evil.example.')
})
