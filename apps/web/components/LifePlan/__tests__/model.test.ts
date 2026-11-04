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
