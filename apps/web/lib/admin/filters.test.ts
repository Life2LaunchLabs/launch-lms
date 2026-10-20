import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appliedCount,
  appliedFilters,
  clearFilter,
  clearFilters,
  filterDefaults,
  filterQuery,
  isOn,
  matchesSearch,
  readFilters,
  setFilter,
  toggleFilter,
  type FilterSpec,
  type FilterValues,
} from './filters.ts'

// The Assignments tab's filters, as in the prototype.
const SPECS: FilterSpec[] = [
  { key: 'status', label: 'Status', default: 'current', options: [{ value: 'current', label: 'Active and paused' }, { value: 'ended', label: 'Ended' }, { value: 'all', label: 'Any status' }] },
  { key: 'group', label: 'Group', options: [{ value: '', label: 'Any group' }, { value: '7', label: 'Class of 2027 – Advisory B' }] },
  { key: 'badge', label: 'Earns a badge', bool: true },
]

test('defaults apply nothing, and the URL holds only what differs from them', () => {
  const values = filterDefaults(SPECS)
  assert.deepEqual(values, { q: '', status: 'current', group: '', badge: '' })
  assert.equal(appliedCount(SPECS, values), 0)
  assert.equal(filterQuery(SPECS, values), '')

  const read = readFilters(SPECS, new URLSearchParams('q=+career+&group=7&badge=1&status=current&view=requests'))
  assert.deepEqual(read, { q: 'career', status: 'current', group: '7', badge: '1' })
  // Other parameters in the URL stay; defaults leave it.
  assert.equal(filterQuery(SPECS, read, 'view=requests&status=ended'), 'view=requests&q=career&group=7&badge=1')
  // A record of params (as a page's searchParams) reads the same.
  assert.deepEqual(readFilters(SPECS, { group: ['7', '8'], badge: 'true' }), { q: '', status: 'current', group: '7', badge: '1' })
  assert.equal(readFilters(SPECS, { badge: 'nope' }).badge, '')
})

test('chips name each applied filter, and an option not loaded yet shows its value', () => {
  const values = setFilter(SPECS, setFilter(SPECS, filterDefaults(SPECS), 'group', '7'), 'badge', true)
  assert.deepEqual(appliedFilters(SPECS, values), [
    { key: 'group', label: 'Group: Class of 2027 – Advisory B' },
    { key: 'badge', label: 'Earns a badge' },
  ])
  assert.equal(appliedCount(SPECS, values), 2)
  assert.deepEqual(appliedFilters(SPECS, { ...values, group: '99', badge: '' }), [{ key: 'group', label: 'Group: 99' }])
  assert.deepEqual(appliedFilters(SPECS, { ...values, status: 'ended', group: '', badge: '' }), [{ key: 'status', label: 'Status: Ended' }])
})

test('removing one chip resets it to its default, and Clear all keeps the search', () => {
  let values: FilterValues = { ...filterDefaults(SPECS), q: 'priya', status: 'all', group: '7', badge: '1' }
  values = clearFilter(SPECS, values, 'status')
  assert.equal(values.status, 'current')
  values = toggleFilter(SPECS, values, 'badge')
  assert.equal(isOn(values, 'badge'), false)
  assert.equal(isOn(toggleFilter(SPECS, values, 'badge'), 'badge'), true)
  assert.deepEqual(clearFilters(SPECS, values), { q: 'priya', status: 'current', group: '', badge: '' })
  assert.equal(clearFilter(SPECS, values, 'q').q, '')
  // Unknown keys change nothing.
  assert.equal(setFilter(SPECS, values, 'weather', 'sunny'), values)
})

test('search matches every word across the fields, ignoring case and accents', () => {
  assert.equal(matchesSearch('', 'anything'), true)
  assert.equal(matchesSearch('career ready', 'College & Career Readiness', 'Earns Career Ready'), true)
  assert.equal(matchesSearch('career capstone', 'College & Career Readiness', null, undefined, false), false)
  assert.equal(matchesSearch('jose', 'José Álvarez'), true)
  assert.equal(matchesSearch('  V2 ', 'Version', 2, 'v2'), true)
})
