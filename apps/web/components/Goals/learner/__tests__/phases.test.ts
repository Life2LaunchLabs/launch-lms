import { describe, expect, test } from 'bun:test'
import { groupByPhase, homePhaseId, phaseOfGoal } from '../phases'

const doc: any = { version: 1, start: '2026-09', phases: [
  { id: 'hs', title: 'High school', months: 12, goals: ['g_old'] },
  { id: 'cc', title: 'Community college', months: 24, goals: ['g_cc'] },
  { id: 'job', title: 'Vet tech', months: 60, goals: [] },
  { id: 'own', title: 'My own clinic', months: 60 },
] }
const goal = (goal_uuid: string) => ({ goal_uuid })
const nov2027 = new Date(2027, 10, 2)

describe('goals by phase', () => {
  test('a goal in no phase follows the phase now', () => {
    expect(homePhaseId(doc, nov2027)).toBe('cc')
    expect(phaseOfGoal(doc, 'g_new', nov2027)).toBe('cc')
    expect(phaseOfGoal(doc, 'g_old', nov2027)).toBe('hs')
  })

  test('phases come in order with when they are, and empty past phases drop out', () => {
    const groups = groupByPhase(doc, [goal('g_cc'), goal('g_new'), goal('g_old')], nov2027)
    expect(groups.map((group) => [group.id, group.when, group.goals.map((item) => item.goal_uuid)])).toEqual([
      ['hs', 'done', ['g_old']], ['cc', 'now', ['g_cc', 'g_new']], ['job', 'next', []], ['own', 'later', []],
    ])
    expect(groupByPhase(doc, [goal('g_cc')], nov2027).map((group) => group.id)).toEqual(['cc', 'job', 'own'])
  })

  test('before the plan starts the first phase is next and takes loose goals; without a plan there is one group', () => {
    expect(homePhaseId(doc, new Date(2026, 0, 1))).toBe('hs')
    expect(groupByPhase(doc, [], new Date(2026, 0, 1))[0].when).toBe('next')
    expect(groupByPhase(null, [goal('a')])).toEqual([{ id: null, title: 'Your goals', when: null, goals: [goal('a')] }])
  })
})
