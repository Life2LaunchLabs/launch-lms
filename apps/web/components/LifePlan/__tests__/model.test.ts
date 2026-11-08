import { describe, expect, test } from 'bun:test'
import type { Debt, LifeDoc, Phase } from '@services/life/life'
import { lineValue, newDoc, project, stretches } from '../model'

const phase = (id: string, months: number, pay = 3000): Phase => ({
  id, title: id, kind: 'other', place: null, place_label: '', months, goals: [],
  lines: [{ id: `${id}-pay`, cat: 'other_in', item: null, title: 'Pay', side: 'in', settings: {}, start: 0, end: null, hours: null, own: { unit: 'mo', value: pay, hours: null } }],
} as any)
const plan = (debts: Debt[], phases = [phase('p1', 12), phase('p2', 12)]): LifeDoc => ({ ...newDoc(), start: '2027-01', phases, debts })
const loan = (over: Partial<Debt> = {}): Debt => ({ id: 'd1', kind: 'student_loan', title: 'Student loan', balance: 1000, rate: 0, payment: 100, start: null, ...over })
const run = (doc: LifeDoc) => project(doc, (_p, l) => lineValue(l, null))

describe('life plan debts', () => {
  test('a loan taken in the first month of a stretch shows in that stretch', () => {
    const doc = plan([loan({ start: { phase: 'p1', month: 0 } })])
    const s = stretches(doc, doc.phases[0])[0]
    const [d] = run(doc).debtsAt(s.g0)
    expect(d.state).toBe('owing')
    expect(d.balance).toBe(1000)
    expect(d.payment).toBe(100)
  })

  test('a loan taken mid-phase is listed in the earlier stretch as starting later', () => {
    const doc = plan([loan({ start: { phase: 'p1', month: 5 } })])
    const [first, second] = stretches(doc, doc.phases[0])
    const p = run(doc)
    const pick = (g: number) => { const d = p.debtsAt(g)[0]; return [d.state, d.balance, d.payment] }
    expect(pick(first.g0)).toEqual(['later', 1000, 0])
    expect(p.debtsAt(first.g0)[0].startsAt).toBe(5)
    expect(pick(second.g0)).toEqual(['owing', 1000, 100])
  })

  test('a paid-off debt stays listed, with when it was paid off', () => {
    const doc = plan([loan()])
    const p = run(doc)
    const later = p.debtsAt(12)[0]
    expect(later.state).toBe('paid')
    expect(later.paidOffAt).toBe(9)
    expect(later.payment).toBe(0)
  })

  test('a debt with no balance yet is still listed', () => {
    expect(run(plan([loan({ balance: 0 })])).debtsAt(0)).toHaveLength(1)
  })
})

const job = (id: string, months: number, pay = 3000): Phase => ({ ...phase(id, months, pay), lines: [{ ...phase(id, months, pay).lines[0], cat: 'work' }] } as any)

describe('life plan money model', () => {
  test('paying more from a later stretch pays a debt off sooner, and the minimum stays the floor', () => {
    const base = plan([loan({ balance: 2400, payment: 100 })])
    const more: LifeDoc = { ...base, policies: [{ id: 'x', target: 'd1', phase: 'p1', month: 6, pay: 300 }] }
    const less: LifeDoc = { ...base, policies: [{ id: 'x', target: 'd1', phase: 'p1', month: 0, pay: 20 }] }
    expect(run(base).debtsAt(0)[0].paidOffAt).toBe(23)
    expect(run(more).debtsAt(0)[0].paidOffAt).toBe(11)
    expect(run(more).debtsAt(6)[0].payment).toBe(300)
    expect(run(less).debtsAt(0)[0].payment).toBe(100)
  })

  test('paying a card in full clears it that month', () => {
    const doc: LifeDoc = { ...plan([loan({ kind: 'card', balance: 900, payment: 25 })]), policies: [{ id: 'x', target: 'd1', phase: 'p2', month: 0, full: true }] }
    const p = run(doc)
    expect(Math.round((p.debtsAt(12)[0].payment) * 100)).toBe(Math.round((900 - 25 * 12) * 100))
    expect(p.debtsAt(13)[0].state).toBe('paid')
  })

  test('a loan taken later lands its money in savings and is marked; one that pays for a purchase does not', () => {
    const doc = plan([loan({ balance: 20000, payment: 0, start: { phase: 'p1', month: 2 } })])
    const p = run(doc)
    expect(Math.round((p.sav[3] - p.sav[2]) * 100)).toBe(Math.round((20000 + 3000) * 100))
    expect(p.marks.filter((x) => x.kind === 'loan')).toEqual([{ g: 2, kind: 'loan', title: 'Student loan', amount: 20000, ref: 'd1' }])
    const kept = run({ ...doc, debts: [{ ...doc.debts[0], received: false }] })
    expect(Math.round((kept.sav[3] - kept.sav[2]) * 100)).toBe(Math.round((3000) * 100))
  })

  test('a 401(k) puts in a percent of pay and the employer matches up to its limit', () => {
    const doc: LifeDoc = { ...plan([], [job('p1', 12, 4000)]) }
    doc.savings = [...doc.savings, { id: 'k', kind: 'k401', title: '401(k)', balance: 0, rate: 0, monthly: 0, main: false, pct: 6, match: 4 }]
    const s = run(doc).savingsAt(0).find((x) => x.id === 'k')!
    expect(Math.round((s.put) * 100)).toBe(Math.round((240) * 100))
    expect(Math.round((s.match) * 100)).toBe(Math.round((160) * 100))
  })

  test('a starting point replaces the worked-out balances and is marked', () => {
    const doc = plan([loan({ balance: 5000, payment: 0 })])
    doc.phases[1] = { ...doc.phases[1], starting: { savings: { save: 1234 }, debts: { d1: 4000 } } }
    const p = run(doc)
    expect(p.savingsAt(12)[0].balance).toBe(1234)
    expect(p.debtsAt(12)[0].balance).toBe(4000)
    expect(p.marks.some((x) => x.kind === 'start' && x.g === 12)).toBe(true)
  })

  test('money you are short grows at the card rate', () => {
    const doc: LifeDoc = { ...plan([], [phase('p1', 2, 0)]), card_rate: 24 }
    doc.phases[0].lines.push({ id: 'rent', cat: 'home', item: null, title: 'Rent', side: 'out', settings: {}, start: 0, end: null, hours: null, own: { unit: 'mo', value: 1000, hours: null } } as any)
    const p = run(doc)
    expect(Math.round((p.short[1]) * 100)).toBe(Math.round((1000) * 100))
    expect(Math.round((p.short[2]) * 100)).toBe(Math.round((1000 * 1.02 + 1000) * 100))
    expect(p.marks.filter((x) => x.kind === 'short')).toHaveLength(1)
  })
})

describe('loan story', () => {
  test('a schedule pays off and counts the interest', async () => {
    const { schedule } = await import('../LoanStory')
    const s = schedule(12000, 0, 100)
    expect(s.months).toBe(120)
    expect(Math.round(s.total)).toBe(12000)
    const i = schedule(12000, 6, 133.23)
    expect(i.months).toBe(120)
    expect(Math.abs(i.total - 12000 - 3987.6) < 1).toBe(true)
    expect(schedule(10000, 12, 100).months).toBe(null)
  })
})

describe('what is left each month', () => {
  test('goes to savings by default, and to debt (highest rate first) when the learner says so', () => {
    const debts = [loan({ id: 'a', rate: 5, balance: 5000 }), loan({ id: 'b', rate: 20, balance: 500 })]
    const save = run(plan(debts))
    expect(save.extra[0]).toBe(0)
    expect(save.left[0]).toBe(2800)

    const doc = { ...plan(debts), policies: [{ id: 'p', target: 'left', phase: 'p1', month: 0, to: 'debt' as const }] }
    const p = run(doc)
    expect(p.left[0]).toBe(2800)
    expect(Math.round(p.extra[0])).toBe(2800)
    const [a, b] = p.debtsAt(1)
    expect(b.state).toBe('paid')
    expect(a.balance < 5000 - 100 - 2000).toBe(true)
    // Nothing went to savings that month; once the debts are gone, savings get it again.
    expect(p.historyOf('save')[1]).toBe(0)
    expect(p.historyOf('save')[24] > 0).toBe(true)
  })
})
