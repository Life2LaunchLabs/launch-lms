import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyAgentFieldProposal,
  beginUserFieldInteraction,
  cancelObjectEdits,
  createObjectEditState,
  endUserFieldInteraction,
  recoverObjectEditState,
  reserveAgentField,
  restoreAgentProposal,
  shouldOpenHubNewPlanEditor,
  summarizeObjectReview,
  updateUserField,
} from '../objectEditing.ts'

test('a cancelled new-plan editor stays closed until Hub makes a later proposal', () => {
  const run = {
    status: 'active', scope: { kind: 'new_plan' }, objects: [{ object_key: 'new-plan', status: 'cancelled' }],
    events: [
      { sequence: 1, kind: 'plan.proposed' },
      { sequence: 2, kind: 'plan.cancelled' },
    ],
  }
  assert.equal(shouldOpenHubNewPlanEditor(run), false)
  assert.equal(shouldOpenHubNewPlanEditor({ ...run, events: [...run.events, { sequence: 3, kind: 'plan.proposed' }] }), true)
  assert.equal(shouldOpenHubNewPlanEditor({ ...run, objects: [{ object_key: 'new-plan', status: 'editing' }] }), true)
})

test('an agent cannot reserve a learner-active or learner-dirty field', () => {
  const initial = createObjectEditState({ title: 'Original' })
  const focused = beginUserFieldInteraction(initial, 'title')
  assert.equal(reserveAgentField(focused, 'title', 'agent-1').reason, 'user-active')

  const dirty = endUserFieldInteraction(updateUserField(focused, 'title', 'My wording'), 'title')
  assert.equal(reserveAgentField(dirty, 'title', 'agent-1').reason, 'user-dirty')
  assert.equal(dirty.title.current, 'My wording')
})

test('only the matching reservation can release a complete proposal', () => {
  const initial = createObjectEditState({ description: 'Before' })
  const reservation = reserveAgentField(initial, 'description', 'agent-1')
  assert.equal(reservation.accepted, true)
  assert.equal(reservation.state.description.presentation, 'preparing')
  assert.strictEqual(applyAgentFieldProposal(reservation.state, 'description', 'stale', 'Wrong'), reservation.state)

  const proposed = applyAgentFieldProposal(reservation.state, 'description', 'agent-1', 'After')
  assert.equal(proposed.description.current, 'After')
  assert.equal(proposed.description.presentation, 'proposed')
})

test('learner customization can return to the proposal or cancel the object', () => {
  const initial = createObjectEditState({ title: 'Original' })
  const reserved = reserveAgentField(initial, 'title', 'agent-1').state
  const proposed = applyAgentFieldProposal(reserved, 'title', 'agent-1', 'Hub proposal')
  const customized = updateUserField(proposed, 'title', 'My version')
  assert.equal(customized.title.presentation, 'customized')
  assert.equal(restoreAgentProposal(customized, 'title').title.current, 'Hub proposal')
  assert.deepEqual(cancelObjectEdits(customized), createObjectEditState({ title: 'Original' }))
})

test('recovering an object restores current values and proposal provenance', () => {
  const recovered = recoverObjectEditState(
    { name: '', description: '', due_date: '' },
    { name: 'My custom plan', description: 'Suggested context', due_date: '2099-12-31' },
    { name: 'Career plan', description: 'Suggested context', due_date: '2099-12-31' },
  )
  assert.equal(recovered.name.presentation, 'customized')
  assert.equal(recovered.description.presentation, 'proposed')
  assert.equal(recovered.name.proposal, 'Career plan')
})

test('review receipts distinguish accepted, customized, rejected, and learner-entered fields', () => {
  const initial = createObjectEditState({ accepted: 'old', customized: 'old', rejected: 'old', entered: 'old' })
  let state = initial
  for (const field of ['accepted', 'customized', 'rejected']) {
    state = applyAgentFieldProposal(reserveAgentField(state, field, field).state, field, field, 'proposal')
  }
  state = updateUserField(state, 'customized', 'mine')
  state = updateUserField(state, 'rejected', 'old')
  state = updateUserField(state, 'entered', 'mine')
  assert.deepEqual(summarizeObjectReview(state), {
    accepted: 'accepted', customized: 'customized', rejected: 'rejected', entered: 'entered',
  })
})
