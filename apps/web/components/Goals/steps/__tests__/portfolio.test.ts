import { describe, expect, test } from 'bun:test'
import { portfolioAsk, portfolioTally } from '@components/Goals/steps/portfolio'

describe('a portfolio step that counts items (DEV-210)', () => {
  test('shows how many count, even past what it needs', () => {
    expect(portfolioTally(2, 3)).toBe('2 of 3')
    expect(portfolioTally(3, 3)).toBe('3 of 3')
    expect(portfolioTally(4, 3)).toBe('4 counting, 3 needed')
  })

  test('asks for skills and values in the words the portfolio uses', () => {
    expect(portfolioAsk({ part: 'traits', count: 3 })).toBe('At least 3 skills and values')
  })
})
