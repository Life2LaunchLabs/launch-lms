import assert from 'node:assert/strict'
import test from 'node:test'

import { FALLBACK_LAUNCH_CARDS, launchCardsProblem, usableLaunchCards } from '../launchCards.ts'

const card = (label = 'a', first_message = 'b') => ({ label, hint: '', first_message })

test('fallback cards are valid to save', () => {
  assert.equal(launchCardsProblem(FALLBACK_LAUNCH_CARDS), null)
})

test('a draft needs one to six complete cards', () => {
  assert.match(launchCardsProblem([]) || '', /at least one/)
  assert.match(launchCardsProblem(Array.from({ length: 7 }, () => card())) || '', /at most 6/)
  assert.match(launchCardsProblem([card('  ', 'x')]) || '', /title and an opening/)
  assert.match(launchCardsProblem([card('x', ' ')]) || '', /title and an opening/)
})

test('malformed server data is ignored rather than rendered', () => {
  assert.deepEqual(usableLaunchCards(undefined), [])
  assert.deepEqual(usableLaunchCards([{ label: 'x' }, null, card()]), [card()])
})
