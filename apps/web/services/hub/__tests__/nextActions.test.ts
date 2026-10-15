import assert from 'node:assert/strict'
import test from 'node:test'

import { actionableHubActions, hubActionHref, type HubNextAction } from '../nextActions.ts'

const base = { title: 't', reason: 'r', route: '/goals/g1?step=s1', tier: 3 }

test('discovery fallbacks are not actionable, so the launch cards show instead', () => {
  const discover: HubNextAction = { ...base, kind: 'discover', route: '/resources', tier: 4 }
  assert.deepEqual(actionableHubActions([discover]), [])
})

test('goal steps are kept in order', () => {
  const items: HubNextAction[] = [{ ...base, kind: 'step', title: 'a', goal_uuid: 'g1' }, { ...base, kind: 'step', title: 'b', goal_uuid: 'g2' }]
  assert.deepEqual(actionableHubActions(items).map((item) => item.title), ['a', 'b'])
})

test('a missing or malformed response is empty', () => {
  assert.deepEqual(actionableHubActions(undefined), [])
  assert.deepEqual(actionableHubActions({} as any), [])
})

test('a step opens on its goal page; anything else keeps its route', () => {
  assert.equal(hubActionHref({ ...base, kind: 'step', goal_uuid: 'g1', step_uuid: 's1' }), '/plans/g1?step=s1')
  assert.equal(hubActionHref({ ...base, kind: 'discover', route: '/resources' }), '/resources')
})
