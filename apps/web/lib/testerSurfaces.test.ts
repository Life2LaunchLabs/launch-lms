import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { TESTER_SWITCHES, testerSurfaceEnabled, type TesterSurface } from './testerSurfaces.ts'

const settings = (values: Record<string, string>) => (key: string, fallback = '') => values[key] ?? fallback
const surfaces = Object.keys(TESTER_SWITCHES) as TesterSurface[]

test('production settings (nothing set) turn every tester surface off', () => {
  for (const surface of surfaces) assert.equal(testerSurfaceEnabled(surface, settings({})), false, surface)
})

test('only an exact true turns a surface on', () => {
  for (const surface of surfaces) {
    for (const value of ['false', '0', 'yes', '', 'enabled']) {
      assert.equal(testerSurfaceEnabled(surface, settings({ [TESTER_SWITCHES[surface]]: value })), false, `${surface}=${value}`)
    }
    assert.equal(testerSurfaceEnabled(surface, settings({ [TESTER_SWITCHES[surface]]: 'true' })), true, surface)
    assert.equal(testerSurfaceEnabled(surface, settings({ [TESTER_SWITCHES[surface]]: ' TRUE ' })), true, surface)
  }
})

test('every tester surface asks the shared helper', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  assert.match(source('../components/Operations/OperationsSurface.tsx'), /testerSurfaceEnabled\('operations'/)
  assert.match(source('../components/Admin/Platform/UserTests/TestPersonaBar.tsx'), /testerSurfaceEnabled\('userTests'/)
  assert.match(source('../app/auth/test-entry/page.tsx'), /testerSurfaceEnabled\('userTests'/)
})

test('the site publishes the user-test switch from the same setting the API reads', () => {
  const wrapper = readFileSync(new URL('../server-wrapper.js', import.meta.url), 'utf8')
  assert.match(wrapper, /LAUNCHLMS_USER_TESTS_ENABLED/)
  assert.match(wrapper, /NEXT_PUBLIC_USER_TESTS_ENABLED/)
})
