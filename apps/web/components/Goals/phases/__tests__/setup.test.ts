import { describe, expect, test } from 'bun:test'
import type { Activity } from '@services/life/life'
import { eyebrowFor, purposeOptions, suggestTitle } from '../setup'

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
