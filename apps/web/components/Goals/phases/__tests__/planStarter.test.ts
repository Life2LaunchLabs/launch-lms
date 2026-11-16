import { describe, expect, test } from 'bun:test'
import { planStarter } from '../setup'

describe('Plan it with Coach', () => {
  test('Coach opens about the phase, and the page context names its dates, what it is about and where', () => {
    const starter = planStarter({ title: 'Gap year', place_label: 'Portland, OR', activities: [{ kind: 'working', career_title: 'Cashiers', employer: 'Fred Meyer' } as any] }, 'Sep 2027 – Aug 2028')
    expect(starter.opener).toBe('Hi! Want to set some goals for your “Gap year” phase in Portland? Tell me what you have in mind, or ask me for ideas.')
    expect(starter.context).toBe('Plan it with Coach, on this phase of their plan: “Gap year” (Sep 2027 – Aug 2028). What they’ll be doing: Cashier at Fred Meyer. Where: Portland. Help them set goals for this phase and pick what to do first, starting from their reply.')
  })

  test('parts the learner has not set are left out', () => {
    const starter = planStarter({ title: 'College', activities: [], place_label: '' })
    expect(starter.opener).toBe('Hi! Want to set some goals for your “College” phase? Tell me what you have in mind, or ask me for ideas.')
    expect(starter.context).toBe('Plan it with Coach, on this phase of their plan: “College”. Help them set goals for this phase and pick what to do first, starting from their reply.')
  })
})
