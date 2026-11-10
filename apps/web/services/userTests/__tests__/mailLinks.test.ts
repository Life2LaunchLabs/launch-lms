import assert from 'node:assert/strict'
import test from 'node:test'

import { personaMailHtml } from '../mailLinks.ts'

test('every email link opens in the whole window through the session carrier', () => {
  const html = '<p>Hi</p><a class="btn" href="https://park.example.com/invite?code=a&amp;b=1" target="_blank">Join</a> <A HREF=\'https://x.example.com/\'>x</A>'
  const out = personaMailHtml(html, (url) => `https://carry.example.com/?to=${encodeURIComponent(url)}`)
  assert.ok(out.startsWith('<base target="_top">'))
  assert.ok(out.includes('<a target="_top" class="btn" href="https://carry.example.com/?to=https%3A%2F%2Fpark.example.com%2Finvite%3Fcode%3Da%26b%3D1"'))
  assert.ok(out.includes('<a target="_top" href="https://carry.example.com/?to=https%3A%2F%2Fx.example.com%2F"'))
})

test('an email without links is left as it is', () => {
  assert.equal(personaMailHtml('<p>Hello</p>', () => 'nope'), '<base target="_top"><p>Hello</p>')
})
