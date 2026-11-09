import { describe, expect, test } from 'bun:test'
import { setShown } from '../way'
import type { LifeDoc } from '@services/life/life'
import { mi, endOf, setLength, setStart, canMakeOptional, makeOptional, isSkip, detours, fillSkip, addSkip, canAddSkip, showWayTo, addAfter, bottomOf, addBefore, addBetween, addOption, addRejoin, addRoute, canJoin, current, endsOf, groupKey, heldShape, join, kids, lift, liftLine, loosePiece, mergeRoute, normalize, optionsOf, pieceOf, place, placeBefore, rank, rejoinOf, remove, routeDoc, routeName, routes, routesFor, split, splitOf, whenOf } from '../graph'

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
    expect(all.map((r) => routeName(r, all)).sort()).toEqual(['College', 'Electrician via Electrician apprentice', 'Electrician via Trade school'])
    expect(endsOf(doc, 'hs').map((p) => p.id).sort()).toEqual(['col', 'el'])
    // An old plan's phase lasts until the first phase after it started, and its options all start when it ends.
    expect(doc.phases.find((p) => p.id === 'hs')!.months).toBe(46)
    expect(kids(doc, 'hs').map((p) => p.starts)).toEqual(['2027-07', '2027-07', '2027-07'])
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
    // Trade school was the only phase in its option, so the option goes: no skip from High school is left behind.
    expect(doc.phases.find((p) => p.id === 'el')!.after).toEqual(['ap'])
    expect(doc.events).toEqual([])
  })

  test('a route reads as one line for the budget, and changes go back into the map', () => {
    const doc = map()
    const r = routeDoc(doc, 'tr')
    expect(r.phases.map((p) => p.id)).toEqual(['ms', 'hs', 'tr', 'el'])
    expect(r.phases.map((p) => p.months)).toEqual([36, 46, 34, 36])
    expect(r.events.map((e) => e.id)).toEqual(['e1'])
    expect(routeDoc(doc, 'ap').events).toEqual([])
    r.phases.find((p) => p.id === 'tr')!.lines.push({ id: 'l1', cat: 'food', title: 'Food', side: 'out', settings: {}, start: 0 })
    r.phases.find((p) => p.id === 'tr')!.months = 99
    const back = mergeRoute(doc, r)
    expect(back.phases.find((p) => p.id === 'tr')!.lines.length).toBe(1)
    // The budget can change how long a phase lasts.
    expect(back.phases.find((p) => p.id === 'tr')!.months).toBe(99)
    expect(back.phases.length).toBe(6)
  })

  test('what a route pays, puts in or does with what is left goes back into the map, and other routes keep theirs', () => {
    const doc = { ...map(), policies: [{ id: 'x', target: 'left', phase: 'ap', month: 0, to: 'debt' as const }] }
    const r = routeDoc(doc, 'tr')
    expect(r.policies).toEqual([])
    r.policies = [{ id: 'y', target: 'left', phase: 'tr', month: 2, to: 'debt' }]
    const back = mergeRoute(doc, r)
    expect(back.policies!.map((p) => p.id).sort()).toEqual(['x', 'y'])
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
    // Dates follow the way being looked at: Electrician starts when Nurse ends on the apprenticeship's way.
    const viaAp = normalize(moved, { hs: 'ap' })
    const at = (d: LifeDoc, id: string) => mi(d.phases.find((p) => p.id === id)!.starts!)
    expect(at(viaAp, 'col')).toBe(at(viaAp, 'ap') + 36)
    expect(at(viaAp, 'el')).toBe(at(viaAp, nurse.id) + 12)
    expect(at(normalize(moved, { hs: 'tr' }), 'el')).toBe(at(viaAp, 'tr') + 34)
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
    expect(p('col').starts).toBe('2027-07')
    expect(p('tr').starts).toBe('2028-07')
  })

  test('the bottom of the map: after the last phase, or after every option when it ends in a split', () => {
    const doc = map()
    expect(bottomOf(doc)).toBe(groupKey(['col', 'el']))
    expect(bottomOf(remove(doc, 'col'))).toBe('el')
  })
})

describe('time: phases have lengths, dates follow the way being looked at', () => {
  const L = (id: string, title: string, months: number, after: string[] = [], extra: any = {}) => ({ id, title, kind: 'other', months, lines: [], goals: [], after, ...extra })
  // High school, then a gap year or straight on, then an apprenticeship (2 years) or a program (1 year), then electrician.
  const plan = (): LifeDoc => ({
    version: 1, start: '2023-09', lengths: true, debts: [], savings: [], assets: [], events: [],
    phases: [
      L('hs', 'High school', 45, [], { starts: '2023-09' }),
      L('gap', 'Gap year', 15, ['hs']),
      L('ap', 'Apprenticeship', 24, ['gap']),
      L('pr', 'Electrical program', 12, ['gap']),
      L('el', 'Electrician', 36, ['ap', 'pr']),
    ] as any,
  })
  const at = (d: LifeDoc, id: string) => d.phases.find((p) => p.id === id)!.starts

  test('each phase starts when the one before it ends, and a branch moves what comes after it', () => {
    const first = normalize(plan(), {})
    expect(['hs', 'gap', 'ap', 'el'].map((id) => at(first, id))).toEqual(['2023-09', '2027-06', '2028-09', '2030-09'])
    expect(at(normalize(plan(), { gap: 'pr' }), 'el')).toBe('2029-09')
    expect(endOf(first, first.phases.find((p) => p.id === 'hs')!)).toBe(mi('2027-06'))
  })

  test('changing an end moves everything after it; changing a start moves the end before it', () => {
    const later = setLength(normalize(plan(), {}), 'gap', 27)
    expect(at(normalize(later, {}), 'el')).toBe('2031-09')
    const { doc, changed } = setStart(normalize(plan(), {}), 'gap', mi('2027-08'))
    expect(changed?.id).toBe('hs')
    expect(doc.phases.find((p) => p.id === 'hs')!.months).toBe(47)
    expect(at(normalize(doc, {}), 'ap')).toBe('2028-11')
  })

  test('a length not picked yet takes no time', () => {
    const d = plan(); d.phases.find((p) => p.id === 'gap')!.undated = true
    expect(at(normalize(d, {}), 'ap')).toBe('2027-06')
  })

  test('old plans keep their dates when they turn into lengths', () => {
    const old = normalize({ version: 1, start: '2023-09', debts: [], savings: [], assets: [], events: [], phases: [L('a', 'A', 12, [], { starts: '2023-09' }), L('b', 'B', 12, ['a'], { starts: '2027-06', undated: true }), L('c', 'C', 12, ['b'], { starts: '2028-09' })] as any }, {})
    expect(old.lengths).toBe(true)
    expect(old.phases.map((p) => [p.starts, p.months])).toEqual([['2023-09', 45], ['2027-06', 15], ['2028-09', 12]])
  })

  test('a skip is a phase that takes no time: any phase can be made optional, even one before a split', () => {
    const d = normalize(plan(), {})
    expect(canMakeOptional(d, 'gap')).toBe(true)
    const opt = makeOptional(d, 'gap')
    const options = kids(opt, 'hs'), sk = options[1]
    expect(options.map((p) => p.id)[0]).toBe('gap')
    expect(isSkip(sk)).toBe(true)
    // The skip leads into the same options Gap year does.
    expect(kids(opt, sk.id).map((p) => p.id).sort()).toEqual(['ap', 'pr'])
    expect(at(normalize(opt, { hs: sk.id }), 'ap')).toBe('2027-06')
    expect(at(normalize(opt, { hs: sk.id, [groupKey(['gap', sk.id])]: 'pr' }), 'el')).toBe('2028-06')
    expect(detours(opt, { hs: sk.id })).toEqual([{ key: 'hs', title: 'Skip Gap year' }])
    expect(detours(opt, {})).toEqual([])
    // Skips never show as phases: not now, not in the budget's line.
    setShown({ hs: sk.id })
    expect(routeDoc(normalize(opt), 'ap').phases.map((p) => p.id)).toEqual(['hs', 'ap', 'el'])
    setShown({})
    expect(canAddSkip(opt, 'hs')).toBe(false)
    // Taking Gap year out leaves no lone skip behind.
    const gone = remove(opt, 'gap')
    expect(gone.phases.some((p) => p.pass)).toBe(false)
    expect(gone.phases.find((p) => p.id === 'ap')!.after).toEqual(['hs'])
    // A phase dropped on the skip becomes that option.
    const loose = loosePiece(opt, [{ title: 'Travel', years: 1 }])
    const filled = fillSkip(loose.doc, loose.ids, sk.id)
    expect(filled.phases.some((p) => p.pass)).toBe(false)
    expect(kids(filled, 'hs').map((p) => p.id).sort()).toEqual(['gap', loose.ids[0]].sort())
    expect(kids(filled, loose.ids[0]).map((p) => p.id).sort()).toEqual(['ap', 'pr'])
    // Removing the skip puts the split back as it was.
    expect(kids(remove(opt, sk.id), 'hs').map((p) => p.id)).toEqual(['gap'])
  })

  test('a skip beside options leads to where they meet; one at the end of the plan leads nowhere', () => {
    const d = normalize(plan(), {})
    const r = addSkip(d, 'gap')
    expect(kids(r.doc, 'gap').map((p) => p.id)).toEqual(['ap', 'pr', r.id])
    expect(kids(r.doc, r.id).map((p) => p.id)).toEqual(['el'])
    // A skip someone made stays when another option loses its last phase.
    expect(remove(r.doc, 'pr').phases.find((p) => p.id === 'el')!.after).toEqual(['ap', r.id])
    expect(remove(d, 'pr').phases.find((p) => p.id === 'el')!.after).toEqual(['ap'])
    const end = makeOptional(d, 'el')
    // Electrician follows two ways in: it and its skip are options after that group.
    expect(optionsOf(end, groupKey(['ap', 'pr'])).map((p) => p.id)[0]).toBe('el')
    expect(optionsOf(end, groupKey(['ap', 'pr'])).length).toBe(2)
    const sk = end.phases.find((p) => p.pass)!
    expect(kids(end, sk.id)).toEqual([])
    expect(sk.after!.sort()).toEqual(['ap', 'pr'])
  })

  test('changing the start of a phase after a skip moves the end of the phase before the skip', () => {
    const opt = makeOptional(normalize(plan(), {}), 'gap'), sk = opt.phases.find((p) => p.pass)!
    setShown({ hs: sk.id })
    const { doc, changed } = setStart(normalize(opt), 'ap', mi('2027-09'))
    setShown({})
    expect(changed?.id).toBe('hs')
    expect(doc.phases.find((p) => p.id === 'hs')!.months).toBe(48)
  })

  test('opening a phase shows the way to it', () => {
    const d = normalize(plan(), {})
    expect(showWayTo(d, 'pr', {})).toEqual({ gap: 'pr' })
    expect(showWayTo(d, 'ap', {})).toEqual({})
  })
})
