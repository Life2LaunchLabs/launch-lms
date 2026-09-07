import assert from 'node:assert/strict'
import test from 'node:test'

import {
  advisorFailureRecovery,
  autoViewAfterBehaviorChange,
  hubCanAsk,
  showsHubDiscovery,
} from '../../../app/orgs/[orgslug]/(withmenu)/hub/hubInteraction.ts'

test('Auto moves from live discovery to conversation without changing behavior', () => {
  assert.equal(showsHubDiscovery('auto', 'discover'), true)
  assert.equal(showsHubDiscovery('auto', 'conversation'), false)
  assert.equal(hubCanAsk('auto'), true)
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
