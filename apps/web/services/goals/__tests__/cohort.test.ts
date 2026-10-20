import assert from 'node:assert/strict'
import test from 'node:test'

import { attentionOf, byNeed, closeDate, cohortAggregates, cohortAudiences, cohortPlan, dotOf, firstToDo, helpersOf, paceLabel, paceOf, stepTodo, upcomingStep } from '../cohort.ts'
import { cell, matrix } from './cohortFixture.ts'

const TODAY = '2026-10-19'
const NOW = new Date('2026-10-19T15:00:00Z')

test('the cohort’s plan is the template’s stages and steps, keyed by template key and dated by the assignment', () => {
  const plan = cohortPlan(matrix(), TODAY)
  assert.deepEqual(plan.stages.map((stage) => [stage.stage_uuid, stage.steps.map((step) => step.step_uuid)]), [['explore', ['survey', 'values']], ['plan', ['fair', 'resume']], ['apply', ['apps']]])
  assert.equal(plan.current_stage_uuid, 'plan')
  assert.deepEqual(plan.capabilities, ['view_plan'])
  const steps = plan.stages.flatMap((stage) => stage.steps)
  assert.equal(steps[0].state, 'done')
  assert.equal(steps[1].state, 'started')
  assert.equal(steps[3].due_date, '2026-10-22')
  assert.equal(steps[3].reviewer_guidance, 'One page')
  assert.deepEqual(plan.progress, { done: 1, total: 5 })
})

test('a step’s counts treat everything handed in as waiting on staff', () => {
  const counts = cohortAggregates(matrix())
  assert.deepEqual(counts.resume, { total: 3, done: 0, handed_in: 2, to_grade: 2, not_handed_in: 0, to_settle: 0 })
  assert.deepEqual(counts.fair, { total: 3, done: 0, handed_in: 0, to_grade: 0, not_handed_in: 0, to_settle: 3 })
  assert.equal(closeDate(matrix().stages[1].steps[1], matrix().learners), '2026-10-22')
})

test('what’s left for staff on each step', () => {
  const data = matrix()
  const [survey, values] = data.stages[0].steps
  const [fair, resume] = data.stages[1].steps
  assert.deepEqual(stepTodo(survey, data.learners, NOW), { grade: 0, settle: [], waiting: [], remindable: [], clear: true })
  // Reminded this morning: waiting, but nobody to remind again today.
  assert.deepEqual(stepTodo(values, data.learners, NOW), { grade: 0, settle: [], waiting: ['user_3'], remindable: [], clear: false })
  assert.deepEqual(stepTodo(values, data.learners, new Date('2026-10-20T15:00:00Z')).remindable, ['user_3'])
  assert.deepEqual(stepTodo(fair, data.learners, NOW).settle, ['user_1', 'user_2', 'user_3'])
  assert.equal(stepTodo(resume, data.learners, NOW).grade, 2)
  // A learner step is never settled for people.
  assert.deepEqual(stepTodo({ ...fair, completed_by: 'learner' }, data.learners, NOW).settle, [])
  assert.equal(upcomingStep(data)?.template_key, 'apps')
  assert.equal(firstToDo(data, NOW), 'fair')
})

test('each learner’s steps as dots, their pace, and what needs attention', () => {
  const data = matrix()
  const [explore, plan, apply] = data.stages
  const [ada, ben, cy] = data.learners
  assert.equal(dotOf(ada.cells.survey, explore, TODAY), 'done')
  assert.equal(dotOf(ada.cells.resume, plan, TODAY), 'waiting')
  assert.equal(dotOf(ben.cells.resume, plan, TODAY), 'retry')
  assert.equal(dotOf(cy.cells.values, explore, TODAY), 'late')
  assert.equal(dotOf(cy.cells.resume, plan, TODAY), 'open')
  assert.equal(dotOf(cy.cells.apps, apply, TODAY), 'locked')
  assert.equal(dotOf(undefined, plan, TODAY), 'locked')
  assert.equal(dotOf(cell({ due_date: '2026-10-01', held: true }), explore, TODAY), 'locked')

  assert.equal(paceLabel(paceOf(ada, data.stages, TODAY)), 'Ahead')
  assert.equal(paceLabel(paceOf(ben, data.stages, TODAY)), 'On pace')
  assert.equal(paceLabel(paceOf(cy, data.stages, TODAY)), 'Behind · 1 step')

  assert.deepEqual(attentionOf(ada, data.stages, TODAY), { tone: 'waiting', text: 'Handed in: resume' })
  assert.deepEqual(attentionOf(ben, data.stages, TODAY), { tone: 'retry', text: 'Sent back: resume' })
  assert.deepEqual(attentionOf(cy, data.stages, TODAY), { tone: 'late', text: 'Past close: values' })

  assert.deepEqual(byNeed(data.learners, data.stages, TODAY, (item) => String(item.first_name)).map((item) => item.id), [3, 1, 2])
  assert.deepEqual(helpersOf(ben, [9]).map((person) => person.role), ['Guardian'])
})

test('a group’s assignment talks with its staff and its whole group; one person’s only with its staff', () => {
  assert.deepEqual(cohortAudiences({ assignment_type: 'group' }), ['staff', 'group'])
  assert.deepEqual(cohortAudiences({ assignment_type: 'individual' }), ['staff'])
  assert.deepEqual(cohortAudiences({ assignment_type: 'external' }), ['staff'])
})
