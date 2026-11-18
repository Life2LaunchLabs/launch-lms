import assert from 'node:assert/strict'
import test from 'node:test'

import { appLinkOf } from '../appLinks.ts'

const HOST = 'unstable.life2launch.app'

test('a career or resource pasted from Discover is the app’s own resource', () => {
  assert.deepEqual(appLinkOf('https://unstable.life2launch.app/discover/careers?r=abc123', HOST), { kind: 'resource', uuid: 'resource_abc123' })
  assert.deepEqual(appLinkOf('https://unstable.life2launch.app/discover?r=resource_abc123&q=vet', HOST), { kind: 'resource', uuid: 'resource_abc123' })
  assert.deepEqual(appLinkOf('https://lincoln.unstable.life2launch.app/discover/explore?r=xyz', HOST), { kind: 'resource', uuid: 'resource_xyz' })
  assert.deepEqual(appLinkOf('https://unstable.life2launch.app/orgs/lincoln/discover?r=xyz', HOST), { kind: 'resource', uuid: 'resource_xyz' })
})

test('a plan’s Discover page is the app’s own plan', () => {
  assert.deepEqual(appLinkOf('https://unstable.life2launch.app/discover/plans/goal_template_1/', HOST), { kind: 'plan', uuid: 'goal_template_1' })
})

test('outside sites and other app pages stay plain links', () => {
  assert.equal(appLinkOf('https://www.bls.gov/ooh/discover?r=abc', HOST), null)
  assert.equal(appLinkOf('https://evil-unstable.life2launch.app.example.com/discover?r=abc', HOST), null)
  assert.equal(appLinkOf('https://unstable.life2launch.app/plans', HOST), null)
  assert.equal(appLinkOf('https://unstable.life2launch.app/discover', HOST), null)
  assert.equal(appLinkOf('not a url', HOST), null)
  assert.equal(appLinkOf('https://unstable.life2launch.app/discover?r=abc', ''), null)
})
