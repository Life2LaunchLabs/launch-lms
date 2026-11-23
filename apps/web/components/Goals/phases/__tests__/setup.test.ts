import { describe, expect, test } from 'bun:test'
import type { Activity, PlaceOption } from '@services/life/life'
import { draftOnKeep, eyebrowFor, pendingActivity, purposeOptions, suggestTitle, typedPlace } from '../setup'

const cashier: Activity = { kind: 'working', career: '41-2011.00', career_title: 'Cashiers' }

// FEED-72: a gap-year learner working as a cashier got a first phase named "Cashier", shown twice.
describe('first phase naming', () => {
  test('the line above the name does not repeat it', () => {
    expect(suggestTitle({ activities: [cashier], living: 'family', place_label: 'Eugene, OR' })).toBe('Cashier')
    expect(eyebrowFor([cashier], 'Cashier')).toBe('Working')
    expect(eyebrowFor([cashier], 'cashier ')).toBe('Working')
  })
  test('a phase named for what it is for keeps the job above it', () => {
    expect(eyebrowFor([cashier], 'Gap year')).toBe('Cashier')
    expect(eyebrowFor([cashier, { kind: 'working', career_title: 'Baristas' }], 'Gap year')).toBe('Cashier + Barista')
    expect(eyebrowFor([], 'Gap year')).toBe('')
  })
  test('purposes offer a gap year, and school first for someone in school', () => {
    const work = purposeOptions([cashier])
    expect(work).toContain('Gap year')
    expect(work).not.toContain('Cashier')
    expect(purposeOptions([{ kind: 'learning', level: 'high' }, cashier])[0]).toBe('High school')
  })
})

// FEED-117: Done in "What you're doing" dropped a job and employer that weren't confirmed with the chip.
describe('what Done keeps from the activity picker', () => {
  const nurse = { code: '29-1141.00', title: 'Registered Nurses' }
  test('a picked job keeps the typed employer, or none', () => {
    expect(pendingActivity({ kind: 'working', level: null, career: nurse, typed: ' Salem Health ' })).toEqual({ kind: 'working', career: nurse.code, career_title: nurse.title, employer: 'Salem Health' })
    expect(pendingActivity({ kind: 'working', level: null, career: nurse, typed: '' })).toEqual({ kind: 'working', career: nurse.code, career_title: nurse.title, employer: null })
  })
  test('a typed job or school is kept as typed', () => {
    expect(pendingActivity({ kind: 'working', level: null, career: null, typed: 'Barista' })).toEqual({ kind: 'working', career_title: 'Barista' })
    expect(pendingActivity({ kind: 'learning', level: 'hs', career: null, typed: 'Sheldon High' })).toEqual({ kind: 'learning', level: 'hs', school: 'Sheldon High' })
    expect(pendingActivity({ kind: 'learning', level: 'hs', career: null, typed: '  ' })).toEqual({ kind: 'learning', level: 'hs' })
  })
  test('nothing is kept until there is something to keep', () => {
    expect(pendingActivity({ kind: null, level: null, career: null, typed: '' })).toBe(null)
    expect(pendingActivity({ kind: 'learning', level: null, career: null, typed: 'x' })).toBe(null)
    expect(pendingActivity({ kind: 'working', level: null, career: null, typed: ' ' })).toBe(null)
  })
})

describe('typedPlace (FEED-386)', () => {
  const bend: PlaceOption = { key: 'city:OR:bend', label: 'Bend, OR', detail: 'Deschutes County', level: 'city' }
  test('a town that is not listed can be used as typed, with no key', () => {
    expect(typedPlace('  Shaniko ', [])).toEqual({ key: '', label: 'Shaniko', detail: '', level: 'typed' })
  })
  test('it is offered beside results that only partly match', () => {
    expect(typedPlace('Ben', [bend])?.label).toBe('Ben')
  })
  test('nothing extra when the text names a listed place or is empty', () => {
    expect(typedPlace('bend', [bend])).toEqual(null)
    expect(typedPlace('Bend, OR', [bend])).toEqual(null)
    expect(typedPlace('   ', [])).toEqual(null)
  })
  test('it keeps within the label length the plan allows', () => {
    expect(typedPlace('x'.repeat(200), [])?.label.length).toBe(120)
  })
})

describe('draftOnKeep (FEED-586)', () => {
  test('the check keeps a half-made activity, and nothing from other pickers', () => {
    expect(draftOnKeep('doing', cashier)).toEqual(cashier)
    expect(draftOnKeep('date', cashier)).toEqual(null)
    expect(draftOnKeep(null, null)).toEqual(null)
  })
})
