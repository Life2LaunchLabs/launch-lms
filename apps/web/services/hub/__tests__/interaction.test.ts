import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addHubContextResource,
  addHubContextResources,
  advisorFailureRecovery,
  autoViewAfterBehaviorChange,
  buildHubResourceTrayEntries,
  hubCanAsk,
  newHubTranscriptResources,
  removeHubContextResource,
  showsHubDiscovery,
  toggleHubContextResource,
} from '../../../app/orgs/[orgslug]/(withmenu)/hub/hubInteraction.ts'

test('Auto moves from live discovery to conversation without changing behavior', () => {
  assert.equal(showsHubDiscovery('auto', 'discover'), true)
  assert.equal(showsHubDiscovery('auto', 'conversation'), false)
  assert.equal(hubCanAsk('auto'), true)
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

test('Search is deterministic and Ask is conversation-only', () => {
  assert.equal(showsHubDiscovery('search', 'conversation'), true)
  assert.equal(hubCanAsk('search'), false)
  assert.equal(showsHubDiscovery('ask', 'discover'), false)
  assert.equal(hubCanAsk('ask'), true)
})

test('returning to Auto preserves the surface the learner came from', () => {
  assert.equal(autoViewAfterBehaviorChange('search', 'auto', true), 'discover')
  assert.equal(autoViewAfterBehaviorChange('ask', 'auto', true), 'conversation')
  assert.equal(autoViewAfterBehaviorChange('ask', 'auto', false), 'discover')
  assert.equal(autoViewAfterBehaviorChange('auto', 'search', true), null)
})

test('advisor failure restores the submitted discovery query and a visible result type', () => {
  assert.deepEqual(advisorFailureRecovery('resume templates', [], 'all'), {
    draft: 'resume templates',
    selectedTypes: ['all'],
    autoView: 'discover',
  })
  assert.deepEqual(
    advisorFailureRecovery('resume templates', ['resources'], 'all').selectedTypes,
    ['resources']
  )
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
