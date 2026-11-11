import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_PEOPLE, inOrgWords, peopleAround, peopleWordsOf, setPeopleWords } from './people.ts'

const trainees = { one: 'trainee', many: 'trainees' }

test('swaps learner for the org word, keeping capitals and number', () => {
  assert.equal(inOrgWords('Search learners', trainees), 'Search trainees')
  assert.equal(inOrgWords('Learners keep their plans. One learner’s plan moved.', trainees), 'Trainees keep their plans. One trainee’s plan moved.')
  assert.equal(inOrgWords('LEARNER', trainees), 'TRAINEE')
  assert.equal(inOrgWords('3 learners past due', { one: 'team member', many: 'team members' }), '3 team members past due')
})

test('leaves words that only contain learner alone', () => {
  assert.equal(inOrgWords('learnership and unlearnered', trainees), 'learnership and unlearnered')
})

test('an org without a word says participant', () => {
  assert.deepEqual(peopleWordsOf({ config: { config: { customization: { general: {} } } } }), DEFAULT_PEOPLE)
  assert.deepEqual(peopleWordsOf({ config: { config: { customization: { general: { people_one: 'camper', people_many: 'campers' } } } } }), { one: 'camper', many: 'campers' })
  setPeopleWords(null)
  assert.equal(inOrgWords('Active learners'), 'Active participants')
  setPeopleWords(trainees)
  assert.equal(inOrgWords('Active learners'), 'Active trainees')
  setPeopleWords(null)
})

test('names filled into a sentence keep their own words', () => {
  setPeopleWords(trainees)
  assert.equal(peopleAround('Learner safety 101 is ready for every learner', ['Learner safety 101']), 'Learner safety 101 is ready for every trainee')
  setPeopleWords(null)
})
