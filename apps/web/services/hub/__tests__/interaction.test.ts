import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addHubContextResource,
  addHubContextResources,
  buildHubResourceTrayEntries,
  filterHubSearchResources,
  hubAdvisorHistory,
  inferHubResponseKind,
  newHubTranscriptResources,
  removeHubContextResource,
  toggleHubContextResource,
} from '../../../app/orgs/[orgslug]/(withmenu)/hub/hubInteraction.ts'

test('submission intent chooses a response object without a user-facing mode', () => {
  assert.equal(inferHubResponseKind('fafsa guides'), 'search')
  assert.equal(inferHubResponseKind('Find videos about interviewing'), 'search')
  assert.equal(inferHubResponseKind('resume templates'), 'search')
  assert.equal(inferHubResponseKind('How should I prepare for an interview?'), 'chat')
  assert.equal(inferHubResponseKind('I need help choosing a career'), 'chat')
  assert.equal(inferHubResponseKind('Explain FAFSA dependency status'), 'chat')
  assert.equal(inferHubResponseKind('hello'), 'chat')
  assert.equal(inferHubResponseKind('advice on FAFSA'), 'chat')
})

test('search response objects preserve alternating advisor history for follow-ups', () => {
  assert.deepEqual(hubAdvisorHistory([
    { role: 'user', content: 'personality quiz' },
    { role: 'assistant', content: '', searchQuery: 'personality quiz' },
  ]), [
    { role: 'user', content: 'personality quiz' },
    { role: 'assistant', content: 'Displayed resource search results for “personality quiz”.' },
  ])
})

test('resource search matches useful word forms and requires the submitted concepts', () => {
  const resources = [
    { title: 'Complete Guide to the FAFSA', description: 'Federal student aid application' },
    { title: 'FAFSA deadline calendar', description: 'Important dates' },
    { title: 'Resume guide', description: 'Writing help' },
  ]
  assert.deepEqual(filterHubSearchResources(resources, 'fafsa guides'), [resources[0]])
  assert.deepEqual(filterHubSearchResources(resources, 'fafsa deadlines'), [resources[1]])
  assert.deepEqual(filterHubSearchResources(resources, 'find me some FAFSA guides'), [resources[0]])
})

test('advisor resources only enter the transcript the first time they are introduced', () => {
  const first = { resource_uuid: 'one' }
  const second = { resource_uuid: 'two' }

  assert.deepEqual(newHubTranscriptResources(['one'], [first, second, second]), [second])
  assert.deepEqual(newHubTranscriptResources([], [first, second]), [first, second])
})

test('the resource tray keeps first-seen chronological order and origin', () => {
  const first = { resource_uuid: 'one' }
  const second = { resource_uuid: 'two' }

  assert.deepEqual(buildHubResourceTrayEntries([
    { id: 'assistant-1', resources: [first] },
    { id: 'user-2', resources: [second, first] },
  ]), [
    { resource: first, originGroupId: 'assistant-1' },
    { resource: second, originGroupId: 'user-2' },
  ])
})

test('resource context deduplicates, stays bounded, switches, collapses, and removes', () => {
  const first = { resource_uuid: 'one' }
  const second = { resource_uuid: 'two' }
  const replacedFirst = { resource_uuid: 'one', title: 'Updated' }
  const context = addHubContextResources([], [first, second, replacedFirst], 2)

  assert.deepEqual(context, [second, replacedFirst])
  assert.equal(toggleHubContextResource(null, 'one'), 'one')
  assert.equal(toggleHubContextResource('one', 'one'), null)
  assert.deepEqual(addHubContextResource(context, { resource_uuid: 'three' }, 2), [replacedFirst, { resource_uuid: 'three' }])
  assert.deepEqual(removeHubContextResource(context, 'one', 'one'), {
    resources: [second],
    activeResourceUuid: null,
  })
})
