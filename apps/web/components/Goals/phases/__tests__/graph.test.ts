import { describe, expect, test } from 'bun:test'
import type { LifeDoc } from '@services/life/life'
import { addAfter, addBefore, addBetween, addOption, addRejoin, addRoute, canJoin, current, endsOf, groupKey, heldShape, join, kids, lift, liftLine, loosePiece, mergeRoute, normalize, optionsOf, pieceOf, place, placeBefore, rank, rejoinOf, remove, routeDoc, routeName, routes, routesFor, split, splitOf, whenOf } from '../graph'

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

  test('splits: where options rejoin, and adding an option or a phase they all lead to', () => {
    const doc = map()
    expect(rejoinOf(doc, kids(doc, 'hs'))).toBe(undefined)
    expect(rejoinOf(doc, kids(doc, 'hs').filter((p) => p.id !== 'col'))?.id).toBe('el')
    // Beside Electrician, which two ways lead into: a split keyed by that group.
    const el = doc.phases.find((p) => p.id === 'el')!
    expect(splitOf(el)).toBe(groupKey(['tr', 'ap']))
    const o = addOption(doc, splitOf(el)!, { title: 'Lineworker' })
    expect(optionsOf(o.doc, groupKey(['ap', 'tr'])).map((p) => p.title)).toEqual(['Electrician', 'Lineworker'])
    expect(o.doc.phases.find((p) => p.id === o.id)!.starts).toBe('2030-07')
    const r = addRejoin(doc, 'hs', { title: 'Move out' })
    expect(r.doc.phases.find((p) => p.id === r.id)!.after!.sort()).toEqual(['col', 'el'])
    expect(rejoinOf(r.doc, kids(r.doc, 'hs'))?.id).toBe(r.id)
  })

  test('moving: a piece stops where it meets other ways, and goes back in line or as an option', () => {
    const doc = map()
    // Trade school's option holds just itself: Electrician is shared with the apprenticeship.
    expect(pieceOf(doc, 'tr')).toEqual(['tr'])
    const withEnd = addAfter(doc, 'col', { title: 'Nurse' }).doc
    expect(pieceOf(withEnd, 'col').length).toBe(2)
    expect(heldShape(withEnd, pieceOf(withEnd, 'col')).linear).toBe(true)
    // Move College (and Nurse) in line after the apprenticeship, before Electrician.
    const ids = pieceOf(withEnd, 'col')
    const moved = place(lift(withEnd, 'col'), ids, 'ap', true)
    const col = moved.phases.find((p) => p.id === 'col')!, nurse = moved.phases.find((p) => p.id === ids[1])!
    expect(col.after).toEqual(['ap'])
    expect(moved.phases.find((p) => p.id === 'el')!.after).toEqual(['tr', nurse.id])
    expect(kids(moved, 'hs').map((p) => p.id).sort()).toEqual(['ap', 'tr'])
    // Dates stay in order.
    expect(col.starts! > moved.phases.find((p) => p.id === 'ap')!.starts!).toBe(true)
    expect(moved.phases.find((p) => p.id === 'el')!.starts! > nurse.starts!).toBe(true)
    // Just this one: what followed it now follows what came before.
    const alone = lift(withEnd, 'col', true)
    expect(alone.phases.find((p) => p.id === ids[1])!.after).toEqual(['hs'])
    // As another option after the apprenticeship.
    const opt = place(lift(doc, 'tr'), ['tr'], 'ap', false)
    expect(kids(opt, 'ap').map((p) => p.id).sort()).toEqual(['el', 'tr'])
  })

  test('ranking options puts the first choice first; a piece can go beside phases two ways lead into', () => {
    const doc = rank(map(), ['tr', 'col', 'ap'])
    expect(kids(doc, 'hs').map((p) => p.id)).toEqual(['tr', 'col', 'ap'])
    const loose = loosePiece(doc, [{ title: 'Lineman', years: 1 }])
    const placed = place(loose.doc, loose.ids, groupKey(['tr', 'ap']), true)
    const p = placed.phases.find((x) => x.id === loose.ids[0])!
    expect([...p.after!].sort()).toEqual(['ap', 'tr'])
    expect(optionsOf(placed, groupKey(['tr', 'ap'])).map((x) => x.id)).toContain('el')
  })

  test('a career route waits off the map until you place it', () => {
    const steps = routesFor({ code: '29-2042.00', title: 'Emergency Medical Technicians', job_zone: 3 })[0].steps
    const loose = loosePiece(map(), steps, 2028 * 12)
    expect(loose.doc.phases.find((p) => p.id === loose.ids[0])!.after).toEqual([])
    const placed = place(loose.doc, loose.ids, 'hs', false)
    expect(kids(placed, 'hs').length).toBe(4)
    expect(placed.phases.find((p) => p.id === loose.ids[1])!.after).toEqual([loose.ids[0]])
  })

  test('a route placed in line lifts back off as one line, closing the gap', () => {
    const steps = routesFor({ code: '29-2042.00', title: 'Emergency Medical Technicians', job_zone: 3 })[0].steps
    const loose = loosePiece(map(), steps, 2028 * 12)
    const placed = place(loose.doc, loose.ids, 'hs', true)
    const after = kids(placed, loose.ids[loose.ids.length - 1]).map((x) => x.id)
    expect(after.length > 0).toBe(true)
    const off = liftLine(placed, loose.ids)
    expect(off.phases.find((p) => p.id === loose.ids[0])!.after).toEqual([])
    for (const id of after) expect(off.phases.find((p) => p.id === id)!.after).toContain('hs')
    expect(off.phases.find((p) => p.id === loose.ids[1])!.after).toEqual([loose.ids[0]])
  })

  test('a phase dropped before an option takes its place, and the option follows it', () => {
    const doc = map(), lifted = lift(doc, 'col', true)
    const put = placeBefore(lifted, ['col'], 'tr')
    const p = (id: string) => put.phases.find((x) => x.id === id)!
    expect([p('col').after, p('tr').after, p('el').after]).toEqual([['hs'], ['col'], ['tr', 'ap']])
    expect(p('col').starts).toBe('2027-09')
    expect(p('tr').starts >= '2028-09').toBe(true)
  })
})
