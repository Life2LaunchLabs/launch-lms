import { afterAll, beforeAll, describe, expect, setSystemTime, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SWRConfig } from 'swr'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import StaffGoalPath from '@components/Goals/admin/live/StaffGoalPath'
import GoalPath from '@components/Goals/learner/GoalPath'
import { stepAccess } from '@components/Goals/learner/GoalStepRow'
import { aggregateLine, aggregateNode } from '@components/Goals/path/stepText'
import { connectKeys } from '@services/connect/connect'
import type { StepAggregate } from '@services/goals/admin'
import { goalChat, makeGoal } from './fixtures'

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }
const STAFF = 9
const LEARNER = 7
const reviewed = () => makeGoal({ capabilities: ['view_plan', 'update_progress', 'complete_restricted_objectives'] })

beforeAll(() => setSystemTime(new Date('2026-10-19T12:00:00Z')))
afterAll(() => setSystemTime())

function render(node: React.ReactNode) {
  return renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
    <SWRConfig value={{ provider: () => new Map(), fallback: { [connectKeys.goalChat('goal-1')]: goalChat } }}>{node}</SWRConfig>
  </AppRouterContext.Provider>)
}

const aggregate = (extra: Partial<StepAggregate> = {}): StepAggregate => ({ total: 20, done: 0, handed_in: 0, to_grade: 0, not_handed_in: 0, to_settle: 0, ...extra })

describe('what a step card lets the viewer do', () => {
  test('the learner works their own steps; staff never do', () => {
    const goal = reviewed()
    expect(stepAccess(goal, 'learner', LEARNER)).toEqual({ canWork: true, staff: false })
    expect(stepAccess(goal, 'learner', STAFF)).toEqual({ canWork: false, staff: false })
    expect(stepAccess(goal, 'staff', STAFF)).toEqual({ canWork: false, staff: true })
    expect(stepAccess(goal, 'cohort', STAFF)).toEqual({ canWork: false, staff: true })
  })
  test('staff who don’t review the goal read it without staff controls', () => {
    expect(stepAccess(makeGoal(), 'staff', STAFF)).toEqual({ canWork: false, staff: false })
  })
})

describe('a step across a cohort', () => {
  test('its line counts what’s done, then what’s left for staff', () => {
    expect(aggregateLine(aggregate({ done: 12, to_grade: 3, handed_in: 3 }))).toBe('12 of 20 done · 3 to grade')
    expect(aggregateLine(aggregate({ done: 26, total: 28, not_handed_in: 2 }))).toBe('26 of 28 done · 2 not handed in')
    expect(aggregateLine(aggregate({ done: 4, handed_in: 5 }))).toBe('4 of 20 done · 5 handed in')
    expect(aggregateLine(aggregate({ to_settle: 20 }))).toBe('0 of 20 done · 20 to settle')
  })
  test('its node fills as learners finish it', () => {
    expect(aggregateNode(aggregate())).toEqual({ state: 'open', fraction: 0 })
    expect(aggregateNode(aggregate({ done: 5 }))).toEqual({ state: 'started', fraction: 0.25 })
    expect(aggregateNode(aggregate({ done: 20 }))).toEqual({ state: 'done', fraction: 1 })
  })
})

describe('staff over one learner’s shoulder', () => {
  test('see the learner’s path, with staff controls and notes on the open step', () => {
    const html = render(<StaffGoalPath goal={reviewed()} orgslug="school" orgId={1} token="token" viewerUserId={STAFF} />)
    // The learner's own path: their stage sections, step rows, chat counts and finish.
    expect(html).toContain('aria-label="Apply"')
    expect(html).toContain('aria-label="Write your essay, Closes Oct 30" aria-expanded="true"')
    expect(html).toContain('2 messages about Write your essay')
    expect(html).toContain('aria-label="Finish"')
    // Staff's side of the open step.
    expect(html).toContain('Mark done for them')
    expect(html).toContain('Staff notes · learners never see these')
    expect(html.match(/Staff notes · learners/g)).toHaveLength(1)
  })
  test('without the review capability, no staff controls or notes', () => {
    const html = render(<StaffGoalPath goal={makeGoal()} orgslug="school" orgId={1} token="token" viewerUserId={STAFF} />)
    expect(html).not.toContain('Mark done for them')
    expect(html).not.toContain('Staff notes')
  })
})

describe('an assignment’s plan across its cohort', () => {
  test('rows count learners, staff’s lines replace the card, and one learner’s schedule and finish stay out', () => {
    const plan = makeGoal({ capabilities: ['view_plan', 'edit_schedule', 'complete_restricted_objectives'] })
    const html = render(<GoalPath goal={plan} color="#3b82f6" perspective="cohort" viewer={{ orgslug: 'school', token: 'token', viewerUserId: STAFF }} selectedUuid="resume" onSelect={() => {}}
      aggregates={{ resume: aggregate({ done: 12, handed_in: 3, to_grade: 3 }), essay: aggregate({ done: 20 }) }}
      stepBody={(step) => step.step_uuid === 'resume' ? <p>Grade the resumes</p> : undefined}
      rowExtra={(step, row) => <span>extra:{step.step_uuid}:{row.selected ? 'open' : 'shut'}</span>} />)
    expect(html).toContain('12 of 20 done · 3 to grade')
    expect(html).toContain('aria-label="Write your essay, 20 of 20 done"')
    expect(html).toContain('<p>Grade the resumes</p>')
    expect(html).not.toContain('Handed in. Waiting on review.')
    expect(html).toContain('extra:resume:open')
    expect(html).toContain('extra:essay:shut')
    expect(html).not.toContain('aria-label="Finish"')
    expect(html).not.toContain('Send it closes after Apply ends.')
    // The same plan from staff's seat keeps them.
    const staff = render(<GoalPath goal={plan} color="#3b82f6" perspective="staff" viewer={{ orgslug: 'school', token: 'token', viewerUserId: STAFF }} selectedUuid="" onSelect={() => {}} />)
    expect(staff).toContain('Send it closes after Apply ends.')
    expect(staff).toContain('aria-label="Finish"')
  })
})
