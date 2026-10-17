import assert from 'node:assert/strict'
import test from 'node:test'
import { actionText, cadenceText, ordinal, plural, progressText } from '../routine.ts'

test('a cadence reads the way a person would say it', () => {
  assert.equal(cadenceText({ cadence: 'daily', days: [] }), 'Every day')
  assert.equal(cadenceText({ cadence: 'weekly', days: [0] }), 'Every Sunday')
  assert.equal(cadenceText({ cadence: 'weekly', days: [5, 1, 3] }), 'Monday, Wednesday and Friday')
  assert.equal(cadenceText({ cadence: 'weekly', days: [0, 1] }), 'Monday and Sunday')
  assert.equal(cadenceText({ cadence: 'weekly', days: [1, 2, 3, 4, 5] }), 'Every weekday')
  assert.equal(cadenceText({ cadence: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] }), 'Every day')
  assert.equal(cadenceText({ cadence: 'monthly', days: [15, 1] }), 'The 1st and 15th of every month')
  assert.equal(cadenceText({ cadence: 'monthly', days: [22] }), 'The 22nd of every month')
})

test('ordinals and plurals', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 31].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '31st'])
  assert.equal(plural('job opening', 3), 'job openings')
  assert.equal(plural('company', 2), 'companies')
  assert.equal(plural('day', 2), 'days')
  assert.equal(plural('box', 2), 'boxes')
  assert.equal(plural('application', 1), 'application')
})

test('an action says what each time asks for and how far it has got', () => {
  assert.equal(actionText({ kind: 'list', target: 3, label: 'job opening' }), 'Add 3 job openings')
  assert.equal(actionText({ kind: 'list', target: 1 }), 'Add 1 item')
  assert.equal(actionText({ kind: 'number', label: 'Weight' }), 'Log weight')
  assert.equal(actionText({ kind: 'check' }), 'Do it')
  assert.equal(progressText({ kind: 'list', target: 3 }, 2, 3), '2 of 3 added')
  assert.equal(progressText({ kind: 'number', series: ['Me', 'Rex'] }, 1, 2), '1 of 2 logged')
  assert.equal(progressText({ kind: 'check' }, 1, 1), 'Done')
})
