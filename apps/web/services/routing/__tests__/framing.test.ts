import assert from 'node:assert/strict'
import test from 'node:test'
import { frameAncestors } from '../framing.ts'

test('pages may be framed by ourselves and only the listed Canvas sites', () => {
  assert.equal(frameAncestors([]), "frame-ancestors 'self'")
  assert.equal(
    frameAncestors(['https://ridge.instructure.com', 'https://canvas.school.example:8443']),
    "frame-ancestors 'self' https://ridge.instructure.com https://canvas.school.example:8443",
  )
})

test('anything that is not a plain origin is dropped, so nothing can widen the rule', () => {
  assert.equal(
    frameAncestors(['*', 'https://*.instructure.com', "https://a.example; script-src 'unsafe-inline'", 'javascript:x', 'https://ok.example']),
    "frame-ancestors 'self' https://ok.example",
  )
})
