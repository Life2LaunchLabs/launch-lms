import assert from 'node:assert/strict'
import test from 'node:test'

import { afterChoices, stageBounds, stageClash } from '../timing.ts'
import type { Goal, Stage, Step } from '../types'

const step = (uuid: string, extra: Partial<Step> = {}) => ({ step_uuid: uuid, title: uuid, after_step_uuids: [], start_date: null, due_date: null, ...extra }) as Step
const stage = (uuid: string, steps: Step[], start: string | null, end: string | null) => ({ stage_uuid: uuid, title: uuid, steps, start_date: start, end_date: end }) as Stage
const goal = (stages: Stage[], extra: Partial<Goal> = {}) => ({ stages, unstaged_steps: [], start_date: '2026-09-01', target_date: '2026-12-31', ...extra }) as Goal

const plan = goal([
  stage('research', [step('list'), step('ask', { after_step_uuids: ['list'] })], null, '2026-10-31'),
  stage('apply', [step('resume'), step('send', { start_date: '2026-11-20' })], '2026-11-01', null),
])

test('the first stage starts with the goal; a stage ends the day before the next starts', () => {
  assert.deepEqual(stageBounds(plan, plan.stages[0]), { start: '2026-09-01', end: '2026-10-31' })
  assert.deepEqual(stageBounds(plan, plan.stages[1]), { start: '2026-11-01', end: '' })
})

test('a date outside the stage offers to move the stage, the next stage, or the goal target', () => {
  assert.deepEqual(stageClash(plan, plan.stages[1], '2026-10-20'), { side: 'before', stepDate: '2026-11-01', move: { kind: 'stage', stage: plan.stages[1], start_date: '2026-10-20' } })
  assert.deepEqual(stageClash(plan, plan.stages[0], '2026-11-05'), { side: 'after', stepDate: '2026-10-31', move: { kind: 'stage', stage: plan.stages[1], start_date: '2026-11-06' } })
  const last = goal([stage('only', [], null, '2026-12-31')])
  assert.deepEqual(stageClash(last, last.stages[0], '2027-01-10')?.move, { kind: 'target', target_date: '2027-01-10' })
  assert.equal(stageClash(plan, plan.stages[0], '2026-10-01'), null)
})

test('steps a step cannot wait on are kept, with the reason', () => {
  const reasons = Object.fromEntries(afterChoices(plan, 'research', 'list', '2026-11-10').map((item) => [item.step.step_uuid, item.reason]))
  assert.equal(reasons.ask, 'Already waits on this step')
  assert.equal(reasons.resume, 'Comes in a later stage, apply')
  assert.equal(reasons.list, undefined)
  const late = Object.fromEntries(afterChoices(plan, 'apply', 'resume', '2026-11-10').map((item) => [item.step.step_uuid, item.reason]))
  assert.equal(late.send, 'Opens after this one closes')
  assert.equal(late.list, null)
})
