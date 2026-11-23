import { test } from 'node:test'
import assert from 'node:assert/strict'

import { calendarDaysAgo, daysAgoLabel } from './days.ts'

// Times are local. West of UTC (TZ=America/Los_Angeles) the evening cases cross the UTC day line; they hold in any zone.
const at = (local: string) => new Date(local)

test('work earlier the same local day is today, even after the UTC date has turned (DEV-205)', () => {
  // 9 PM Pacific on Nov 22 is already Nov 23 in UTC.
  const now = at('2026-11-22T21:00:00')
  assert.equal(daysAgoLabel('2026-11-22', now), 'today')
  assert.equal(daysAgoLabel(at('2026-11-22T10:00:00').toISOString(), now), 'today')
  assert.equal(daysAgoLabel(at('2026-11-22T18:30:00').toISOString().replace('Z', ''), now), 'today')
})

test('a bare date is that calendar day, never shifted back by a UTC parse', () => {
  const now = at('2026-11-22T08:00:00')
  assert.equal(daysAgoLabel('2026-11-22', now), 'today')
  assert.equal(daysAgoLabel('2026-11-21', now), 'yesterday')
  assert.equal(calendarDaysAgo('2026-11-18', now), 4)
})

test('late last night is yesterday, not "0 days" by the hour count', () => {
  assert.equal(daysAgoLabel(at('2026-11-21T23:50:00').toISOString(), at('2026-11-22T00:10:00')), 'yesterday')
  assert.equal(daysAgoLabel('2026-11-24', at('2026-11-22T12:00:00')), 'today')
})
