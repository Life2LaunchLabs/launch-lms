import assert from 'node:assert/strict'
import test from 'node:test'
import { isFocusedActivityPath } from '../learnerExperience.ts'

test('activity entry routes focus the player before and after tenant routing', () => {
  for (const path of ['/plans/goal_1/steps/goal_step_1/activity', '/activity/a1']) {
    assert.equal(isFocusedActivityPath(path), true)
    assert.equal(isFocusedActivityPath(`/orgs/academy${path}/`), true)
  }
})

test('plan pages, admin authoring, course details and previews retain their own shells', () => {
  for (const path of [null, '/plans', '/plans/activity', '/course/c1', '/admin/plans/p1/activity/a1', '/preview/activity/token']) {
    assert.equal(isFocusedActivityPath(path), false)
  }
})
