import assert from 'node:assert/strict'
import test from 'node:test'

import { actionableHubActions, type HubNextAction } from '../nextActions.ts'

const base = { title: 't', reason: 'r', route: '/plans/a', tier: 3 }

test('discovery fallbacks are not actionable, so the launch cards show instead', () => {
  const discover: HubNextAction = { ...base, kind: 'discover', route: '/resources', tier: 4 }
  assert.deepEqual(actionableHubActions([discover]), [])
})

test('plan objectives are kept in order', () => {
  const items: HubNextAction[] = [{ ...base, kind: 'objective', title: 'a' }, { ...base, kind: 'objective', title: 'b' }]
  assert.deepEqual(actionableHubActions(items).map((item) => item.title), ['a', 'b'])
})

test('a missing or malformed response is empty', () => {
  assert.deepEqual(actionableHubActions(undefined), [])
  assert.deepEqual(actionableHubActions({} as any), [])
})
