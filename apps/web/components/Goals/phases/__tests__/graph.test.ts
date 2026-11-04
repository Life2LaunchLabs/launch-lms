import { describe, expect, test } from 'bun:test'
import type { LifeDoc } from '@services/life/life'
import { addAfter, addBefore, addBetween, addRoute, canJoin, current, endsOf, join, kids, mergeRoute, normalize, remove, routeDoc, routeName, routes, routesFor, split, whenOf } from '../graph'

const ph = (id: string, title: string, starts: string | null, after: string[] = [], extra: any = {}) => ({ id, title, kind: 'other', months: 12, lines: [], goals: [], starts, after, ...extra })
const today = new Date(2026, 10, 4)
const map = (): LifeDoc => normalize({
  version: 1, start: '2020-09', debts: [], savings: [], assets: [], events: [{ id: 'e1', phase: 'tr', month: 0, title: 'Tools', amount: -800 }],
  phases: [
    ph('ms', 'Middle school', '2020-09'),
    ph('hs', 'High school', '2023-09', ['ms']),
    ph('col', 'College', '2027-09', ['hs'], { idea: true }),
    ph('tr', 'Trade school', '2027-09', ['hs'], { idea: true }),
    ph('ap', 'Electrician apprentice', '2027-07', ['hs'], { idea: true }),
    ph('el', 'Electrician', '2030-07', ['tr', 'ap'], { idea: true, months: 36 }),
  ] as any,
})

describe('a plan as a map', () => {
  test('old plans with no dates run one after another', () => {
    const doc = normalize({ version: 1, start: '2026-09', debts: [], savings: [], assets: [], events: [], phases: [ph('a', 'A', null, [], { months: 12 }), ph('b', 'B', null, [], { months: 24 })] as any })
    expect(doc.phases.map((p) => [p.starts, p.after])).toEqual([['2026-09', []], ['2027-09', ['a']]])
    expect(doc.phases[0].months).toBe(12)
  })

  test('now is the latest real phase; ideas and what follows them are never now', () => {
    const doc = map()
    expect(current(doc, today)?.id).toBe('hs')
    expect(whenOf(doc, doc.phases.find((p) => p.id === 'ms')!, today)).toBe('done')
    expect(whenOf(doc, doc.phases.find((p) => p.id === 'ap')!, today)).toBe('next')
    expect(whenOf(doc, doc.phases.find((p) => p.id === 'el')!, today)).toBe('later')
    expect(current(doc, new Date(2032, 0, 1))?.id).toBe('hs')
  })

  test('routes end where they end, and two ways into one phase are told apart', () => {
    const doc = map(), all = routes(doc)
    expect(all.map((r) => routeName(r, all))).toEqual(['Electrician via Electrician apprentice', 'College', 'Electrician via Trade school'])
    expect(endsOf(doc, 'hs').map((p) => p.id).sort()).toEqual(['col', 'el'])
    // A phase lasts until the first phase after it starts.
    expect(doc.phases.find((p) => p.id === 'hs')!.months).toBe(46)
  })

  test('adding: after, as another option, before, and in between', () => {
    let doc = map()
    const a = addAfter(doc, 'el', { title: 'Own business' }); doc = a.doc
    expect(kids(doc, 'el').map((p) => p.title)).toEqual(['Own business'])
    const b = addAfter(doc, 'hs', { title: 'Gap year' }); doc = b.doc
    expect(kids(doc, 'hs').length).toBe(4)
    const c = addBefore(doc, 'ms', { title: 'Elementary school' }); doc = c.doc
    expect(doc.phases[0].title).toBe('Elementary school')
    const d = addBetween(doc, 'tr', 'el', { title: 'Internship' }); doc = d.doc
    expect(doc.phases.find((p) => p.id === 'el')!.after).toEqual([d.id, 'ap'])
    expect(doc.phases.find((p) => p.id === d.id)!.idea).toBe(true)
  })

  test('joining up and splitting apart', () => {
    let doc = addAfter(map(), 'hs', { title: 'Gap year' }, 2027 * 12 + 5).doc
    const gap = doc.phases.find((p) => p.title === 'Gap year')!
    expect(canJoin(doc, gap.id, 'col')).toBe(true)
    expect(canJoin(doc, 'col', 'hs')).toBe(false)
    doc = join(doc, gap.id, 'col')
    expect(doc.phases.find((p) => p.id === 'col')!.after).toEqual(['hs', gap.id])
    const s = split(doc, 'el', 'tr')
    expect(s.doc.phases.find((p) => p.id === 'el')!.after).toEqual(['ap'])
    expect(s.doc.phases.find((p) => p.id === s.id)!.after).toEqual(['tr'])
  })

  test('removing a phase links what came after it to what came before', () => {
    const doc = remove(map(), 'tr')
    expect(doc.phases.find((p) => p.id === 'el')!.after).toEqual(['hs', 'ap'])
    expect(doc.events).toEqual([])
  })

  test('a route reads as one line for the budget, and changes go back into the map', () => {
    const doc = map()
    const r = routeDoc(doc, 'tr')
    expect(r.phases.map((p) => p.id)).toEqual(['ms', 'hs', 'tr', 'el'])
    expect(r.phases.map((p) => p.months)).toEqual([36, 48, 34, 36])
    expect(r.events.map((e) => e.id)).toEqual(['e1'])
    expect(routeDoc(doc, 'ap').events).toEqual([])
    r.phases.find((p) => p.id === 'tr')!.lines.push({ id: 'l1', cat: 'food', title: 'Food', side: 'out', settings: {}, start: 0 })
    r.phases.find((p) => p.id === 'tr')!.months = 99
    const back = mergeRoute(doc, r)
    expect(back.phases.find((p) => p.id === 'tr')!.lines.length).toBe(1)
    expect(back.phases.find((p) => p.id === 'tr')!.months).toBe(34)
    expect(back.phases.length).toBe(6)
  })

  test('careers add their usual route as ideas, ending in the career', () => {
    const emt = routesFor({ code: '29-2042.00', title: 'Emergency Medical Technicians', job_zone: 3 })
    expect(emt.map((r) => r.steps.map((s) => s.title))).toEqual([['Certificate program', 'Emergency Medical Technician'], ['2-year degree', 'Emergency Medical Technician'], ['Entry job', 'Emergency Medical Technician']])
    const elec = routesFor({ code: '47-2111.00', title: 'Electricians', job_zone: 3 })
    expect(elec[0].steps[0].title).toBe('Electrician apprentice')
    const r = addRoute(map(), 'hs', emt[0].steps)
    const added = r.ids.map((id) => r.doc.phases.find((p) => p.id === id)!)
    expect(added.map((p) => [p.title, p.starts, p.idea])).toEqual([['Certificate program', '2027-07', true], ['Emergency Medical Technician', '2028-07', true]])
    expect(added[1].activities?.[0]).toEqual({ kind: 'working', career: '29-2042.00', career_title: 'Emergency Medical Technicians' })
    expect(added[1].after).toEqual([added[0].id])
  })
})
