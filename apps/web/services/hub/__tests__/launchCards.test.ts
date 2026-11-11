import assert from 'node:assert/strict'
import test from 'node:test'

import { FALLBACK_LAUNCH_CARDS, FALLBACK_STAFF_LAUNCH_CARDS, fallbackLaunchCards, hubLaunchCardsPath, isStaffInOrg, launchCardsProblem, usableLaunchCards } from '../launchCards.ts'

const card = (label = 'a', first_message = 'b') => ({ label, hint: '', first_message })

test('fallback cards are valid to save', () => {
  assert.equal(launchCardsProblem(FALLBACK_LAUNCH_CARDS), null)
  assert.equal(launchCardsProblem(FALLBACK_STAFF_LAUNCH_CARDS), null)
})

test('staff and admins of the org get the staff starters, everyone else the learner ones', () => {
  const roles = [{ org: { id: 7 }, role: { id: 2 } }, { org: { id: 9 }, role: { id: 4 } }, { org: { id: 3 }, role: { id: 1 } }]
  assert.equal(isStaffInOrg(roles, 7), true)
  assert.equal(isStaffInOrg(roles, 3), true)
  assert.equal(isStaffInOrg(roles, 9), false)
  assert.equal(isStaffInOrg(roles, 5), false)
  assert.equal(isStaffInOrg(undefined, 7), false)
  assert.equal(fallbackLaunchCards('staff'), FALLBACK_STAFF_LAUNCH_CARDS)
  assert.equal(fallbackLaunchCards('learner'), FALLBACK_LAUNCH_CARDS)
  assert.ok(!FALLBACK_STAFF_LAUNCH_CARDS.some((card) => FALLBACK_LAUNCH_CARDS.some((other) => other.label === card.label)))
})

test('the cards request names the org so the server can pick the set', () => {
  assert.equal(hubLaunchCardsPath(12), 'hub/launch-cards?org_id=12')
  assert.equal(hubLaunchCardsPath(undefined), 'hub/launch-cards')
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
