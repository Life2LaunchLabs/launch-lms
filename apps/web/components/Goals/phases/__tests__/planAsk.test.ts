import { describe, expect, test } from 'bun:test'
import { planAsk } from '../setup'

describe('Plan it with Coach', () => {
  test('the starter names the phase, its dates, what it is about and where', () => {
    const ask = planAsk({ title: 'Gap year', place_label: 'Portland, OR', activities: [{ kind: 'working', career_title: 'Cashiers', employer: 'Fred Meyer' } as any] }, 'Sep 2027 – Aug 2028')
    expect(ask).toBe('Help me plan this phase of my plan: “Gap year” (Sep 2027 – Aug 2028). What I’ll be doing: Cashier at Fred Meyer. Where: Portland. What goals should I set for it, and what should I do first?')
  })

  test('parts the learner has not set are left out', () => {
    expect(planAsk({ title: 'College', activities: [], place_label: '' })).toBe('Help me plan this phase of my plan: “College”. What goals should I set for it, and what should I do first?')
  })
})
