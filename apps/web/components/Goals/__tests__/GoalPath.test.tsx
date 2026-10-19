import { afterAll, beforeAll, expect, setSystemTime, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SWRConfig } from 'swr'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { GoalChatProvider } from '@components/Goals/chat/GoalChat'
import { GoalEditingProvider } from '@components/Goals/edit/GoalEditing'
import GoalPath from '@components/Goals/learner/GoalPath'
import { connectKeys } from '@services/connect/connect'
import { can, type Goal } from '@services/goals/types'
import { goalChat, makeGoal } from './fixtures'

// The path as the learner sees it on their Plans page, rendered on the server so every detail
// of the markup is pinned: a change to the shared path must leave the learner's view as it was.

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }

beforeAll(() => setSystemTime(new Date('2026-10-19T12:00:00Z')))
afterAll(() => setSystemTime())

/** GoalsWorkspace's wiring around the path, for whoever is signed in as `viewerUserId`. */
function renderPath(goal: Goal, viewerUserId: number, selectedUuid = '') {
  const isSubject = goal.subject?.id === viewerUserId
  const html = renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
    <SWRConfig value={{ provider: () => new Map(), fallback: { [connectKeys.goalChat(goal.goal_uuid)]: goalChat } }}>
      <GoalEditingProvider goal={goal} token="token" color="#3b82f6">
        <GoalChatProvider goal={goal} token="token" orgslug="school">
          <GoalPath goal={goal} color="#3b82f6" selectedUuid={selectedUuid} onSelect={() => {}}
            own={goal.ownership === 'personal' && can(goal, 'delete_plan')}
            viewer={{ orgslug: 'school', token: 'token', viewerUserId, canWork: isSubject && can(goal, 'update_progress'), staff: !isSubject && can(goal, 'complete_restricted_objectives') }} />
        </GoalChatProvider>
      </GoalEditingProvider>
    </SWRConfig>
  </AppRouterContext.Provider>)
  // One tag per line, so a snapshot diff points at what moved; React's generated ids depend on
  // the component tree, not on what shows, so they are left out.
  return html.replace(/></g, '>\n<').replace(/_R_[0-9a-z]+_/g, '_R_')
}

test('an assigned plan opens at the step to do next, with its chat counts', () => {
  expect(renderPath(makeGoal(), 7)).toMatchSnapshot()
})

test('a step waiting on staff, opened', () => {
  expect(renderPath(makeGoal(), 7, 'resume')).toMatchSnapshot()
})

test('a step sent back, opened', () => {
  expect(renderPath(makeGoal(), 7, 'choose')).toMatchSnapshot()
})

test('a locked step, opened, points at the step it waits on', () => {
  expect(renderPath(makeGoal(), 7, 'send')).toMatchSnapshot()
})

test('a done step, opened', () => {
  expect(renderPath(makeGoal(), 7, 'list')).toMatchSnapshot()
})

test('the learner’s own plan: edited in place, stages moved, claimed at the end', () => {
  const goal = makeGoal({
    ownership: 'personal', source: 'none', owner: { id: 7, username: 'sam', name: 'Sam Rivera' },
    capabilities: ['view_plan', 'update_progress', 'edit_structure', 'edit_schedule', 'edit_plan_details', 'delete_plan'],
  })
  expect(renderPath(goal, 7)).toMatchSnapshot()
})

test('the current stage done shows the way on', () => {
  const goal = makeGoal()
  const apply = goal.stages[1]
  goal.stages[1] = { ...apply, steps: apply.steps.map((step) => ({ ...step, status: 'completed', state: 'done', fraction: 1, locked: false, locked_reason: null })) }
  expect(renderPath(goal, 7)).toMatchSnapshot()
})

test('a finished plan', () => {
  const goal = makeGoal({ status: 'finished', finished_at: '2026-10-18', progress: { done: 9, total: 9 } })
  for (const stage of goal.stages) stage.steps = stage.steps.map((step) => ({ ...step, status: 'completed', state: 'done', fraction: 1, locked: false, locked_reason: null }))
  goal.unstaged_steps = goal.unstaged_steps.map((step) => ({ ...step, status: 'completed', state: 'done', fraction: 1 }))
  expect(renderPath(goal, 7)).toMatchSnapshot()
})

test('a plan with no steps yet', () => {
  expect(renderPath(makeGoal({ stages: [], unstaged_steps: [], progress: { done: 0, total: 0 } }), 7)).toMatchSnapshot()
})
