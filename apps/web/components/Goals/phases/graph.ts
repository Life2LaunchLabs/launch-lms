import type { Activity, LifeDoc, Phase } from '@services/life/life'
import { trLocale } from '@/lib/tr'

/*
 * A plan is a map of phases. Each phase starts on a month and lasts until the next one after it
 * starts. A phase can lead to several (a branch: options you're weighing) and follow several (two
 * ways that join up, like a trade school and an apprenticeship both leading to electrician).
 * A way through the map, from the first phase to one with nothing after it, is a route; a route is
 * named by where it ends. Ideas are dashed phases: quick to add and remove.
 *
 * Plans saved before the map have no dates: their phases run one after another from the plan's
 * start, and `normalize` reads them that way.
 */

export type When = 'done' | 'now' | 'next' | 'later'

/** Months since year 0 from "YYYY-MM", and back. */
export const mi = (value: string) => { const [y, m] = value.split('-').map(Number); return y * 12 + m - 1 }
export const ym = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
export const thisMonthIndex = (today = new Date()) => today.getFullYear() * 12 + today.getMonth()
/** A month's name in the current language: "Sep", "sept". */
export const monthName = (month: number, width: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat(trLocale(), { month: width, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, ((month % 12) + 12) % 12, 15))).replace(/\.$/, '')
/** "Sep 2027" from "2027-09" or a month index. */
export const monthText = (value: string | number) => { const i = typeof value === 'number' ? value : mi(value); return `${monthName(i)} ${Math.floor(i / 12)}` }

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
let n = 0
export const phaseId = () => `p${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

/** Every phase gets a start date and its links, and a phase something comes after gets its length from that. */
export function normalize(doc: LifeDoc): LifeDoc {
  const next = clone(doc)
  if (!next.phases.length) return next
  if (!next.phases.some((p) => p.starts)) {
    let m = mi(next.start || ym(thisMonthIndex()))
    next.phases.forEach((p, i) => { p.starts = ym(m); p.after = i ? [next.phases[i - 1].id] : []; m += Math.max(1, p.months || 1) })
  } else {
    // A phase added without a date starts when the one before it would end.
    next.phases.forEach((p, i) => {
      p.after = (p.after || []).filter((id) => id !== p.id && next.phases.some((x) => x.id === id))
      if (!p.starts) { const prev = next.phases.find((x) => x.id === p.after?.[0]) || next.phases[i - 1]; p.starts = prev?.starts ? ym(mi(prev.starts) + Math.max(1, prev.months || 12)) : (next.start || ym(thisMonthIndex())) }
    })
  }
  next.phases.sort((a, b) => mi(a.starts!) - mi(b.starts!))
  for (const p of next.phases) {
    const follow = next.phases.filter((k) => k.after?.includes(p.id)).map((k) => mi(k.starts!))
    if (follow.length) p.months = Math.max(1, Math.min(...follow) - mi(p.starts!))
    else p.months = Math.max(1, p.months || 12)
  }
  next.start = next.phases[0].starts!
  return next
}

export const byId = (doc: LifeDoc, id: string | null | undefined) => doc.phases.find((p) => p.id === id)
const starts = (p: Phase) => mi(p.starts!)
/** What comes straight after a phase: earliest first, real phases before ideas at the same month. */
/** Options in the learner's order (rank, their first choice first), then by when they start. */
const byChoice = (a: Phase, b: Phase) => (a.rank ?? 99) - (b.rank ?? 99) || starts(a) - starts(b) || Number(!!a.idea) - Number(!!b.idea)
export const kids = (doc: LifeDoc, id: string) => doc.phases.filter((p) => p.after?.includes(id)).sort(byChoice)
export const parents = (doc: LifeDoc, p: Phase) => (p.after || []).map((id) => byId(doc, id)).filter(Boolean) as Phase[]
export const roots = (doc: LifeDoc) => doc.phases.filter((p) => !p.after?.length).sort((a, b) => starts(a) - starts(b))
/** When a phase ends: when the first phase after it starts, or its own length when nothing does. */
export const endOf = (doc: LifeDoc, p: Phase) => { const k = kids(doc, p.id); return k.length ? Math.min(...k.map(starts)) : starts(p) + Math.max(1, p.months || 1) }

export function ancestors(doc: LifeDoc, id: string): Phase[] {
  const out = new Map<string, Phase>()
  const walk = (pid: string) => (byId(doc, pid)?.after || []).forEach((a) => { const x = byId(doc, a); if (x && !out.has(a)) { out.set(a, x); walk(a) } })
  walk(id)
  return [...out.values()]
}
/** The phases at the end of every way forward from this one. */
export function endsOf(doc: LifeDoc, id: string): Phase[] {
  const out = new Map<string, Phase>()
  const walk = (pid: string) => { const k = kids(doc, pid); if (!k.length) out.set(pid, byId(doc, pid)!); k.forEach((c) => walk(c.id)) }
  walk(id)
  return [...out.values()]
}
/** Every way through the map. Two routes can end at the same phase, where ways join up. */
export function routes(doc: LifeDoc): Phase[][] {
  const out: Phase[][] = []
  const walk = (p: Phase, acc: Phase[]) => { const a = [...acc, p], k = kids(doc, p.id); if (!k.length) out.push(a); k.forEach((c) => walk(c, a)) }
  roots(doc).forEach((r) => walk(r, []))
  return out
}
/** A route is named by where it ends, and by what differs when two end at the same phase. */
export function routeName(route: Phase[], all: Phase[][]): string {
  const end = route[route.length - 1], same = all.filter((r) => r[r.length - 1] === end)
  if (same.length < 2) return end.title
  const i = route.findIndex((p, j) => same.some((o) => o !== route && o[j] !== p))
  return i >= 0 ? `${end.title} via ${route[i].title}` : end.title
}

/** Real phases: not ideas, and reached through real phases. Only a real phase can be "now". */
export function isReal(doc: LifeDoc, p: Phase, seen = new Set<string>()): boolean {
  if (p.idea || seen.has(p.id)) return false
  seen.add(p.id)
  return !p.after?.length || parents(doc, p).some((x) => isReal(doc, x, seen))
}
/** The phase you're in: the latest real one that has started. None before the plan starts. */
export function current(doc: LifeDoc, today = new Date()): Phase | undefined {
  const t = thisMonthIndex(today)
  return doc.phases.filter((p) => starts(p) <= t && isReal(doc, p)).sort((a, b) => starts(b) - starts(a))[0]
}
export function whenOf(doc: LifeDoc, p: Phase, today = new Date()): When {
  const c = current(doc, today)
  if (p.id === c?.id) return 'now'
  if (starts(p) <= thisMonthIndex(today) && isReal(doc, p)) return 'done'
  return (c ? p.after?.includes(c.id) : !p.after?.length) ? 'next' : 'later'
}

/** The route a phase is shown on: back through its first way in, forward through its first way out. */
export function routeThrough(doc: LifeDoc, id: string): Phase[] {
  const p = byId(doc, id)
  if (!p) return []
  const back: Phase[] = []
  let x: Phase | undefined = p
  const seen = new Set<string>()
  while (x && !seen.has(x.id)) { seen.add(x.id); back.unshift(x); x = parents(doc, x).sort((a, b) => Number(!isReal(doc, a)) - Number(!isReal(doc, b)))[0] }
  const fwd: Phase[] = []
  let y = kids(doc, p.id)[0]
  while (y && !seen.has(y.id)) { seen.add(y.id); fwd.push(y); y = kids(doc, y.id)[0] }
  return [...back, ...fwd]
}

/**
 * The plan as one line of phases, the way the budget and its chart read it: the phases on the route
 * through `id`, each as long as it lasts on that route. Money things tied to phases off the route
 * are left out. Change it, then put it back with `mergeRoute`.
 */
export function routeDoc(doc: LifeDoc, id: string): LifeDoc {
  const route = routeThrough(doc, id)
  if (!route.length) return clone(doc)
  const on = new Set(route.map((p) => p.id))
  const phases = route.map((p, i) => ({ ...clone(p), months: i < route.length - 1 ? Math.max(1, starts(route[i + 1]) - starts(p)) : Math.max(1, p.months || 12) }))
  const keep = (w?: { phase: string } | null) => !w || on.has(w.phase)
  return {
    ...clone(doc),
    start: route[0].starts!,
    phases,
    events: doc.events.filter((e) => on.has(e.phase)).map(clone),
    debts: doc.debts.filter((d) => keep(d.start)).map(clone),
    assets: doc.assets.filter((a) => keep(a.bought) && keep(a.sold)).map(clone),
  }
}
/** Put a changed route back into the whole plan. Dates and links stay the map's. */
export function mergeRoute(doc: LifeDoc, route: LifeDoc): LifeDoc {
  const next = clone(doc)
  const on = new Set(route.phases.map((p) => p.id))
  next.phases = next.phases.map((p) => {
    const r = route.phases.find((x) => x.id === p.id)
    if (!r) return p
    const leaf = !next.phases.some((k) => k.after?.includes(p.id))
    return { ...clone(r), starts: p.starts, after: p.after, months: leaf ? r.months : p.months }
  })
  // Phases added while looking at the route join the map after the one before them.
  route.phases.filter((r) => !next.phases.some((p) => p.id === r.id)).forEach((r) => {
    const i = route.phases.indexOf(r), prev = route.phases[i - 1]
    next.phases.push({ ...clone(r), after: prev ? [prev.id] : [], starts: prev ? ym(mi(next.phases.find((p) => p.id === prev.id)?.starts || route.start) + Math.max(1, prev.months)) : route.start })
  })
  const offRoute = (w?: { phase: string } | null) => !!w && !on.has(w.phase)
  next.events = [...doc.events.filter((e) => !on.has(e.phase)), ...route.events]
  next.debts = [...doc.debts.filter((d) => offRoute(d.start)), ...route.debts]
  next.assets = [...doc.assets.filter((a) => offRoute(a.bought) || offRoute(a.sold)), ...route.assets]
  next.savings = route.savings
  return normalize(next)
}

/* ---------- changing the map ---------- */

export interface NewPhase { title: string; idea?: boolean; activities?: Activity[]; living?: string | null; place?: string | null; place_label?: string; kind?: string; months?: number }
function make(base: Phase | undefined, x: NewPhase, after: string[], start: number): Phase {
  return {
    id: phaseId(), title: x.title.trim() || 'New phase', kind: x.kind || kindOf(x.activities), idea: x.idea ?? true,
    place: x.place !== undefined ? x.place : base?.place ?? null, place_label: x.place_label !== undefined ? x.place_label : base?.place_label || '',
    living: x.living !== undefined ? x.living : base?.living ?? null, activities: x.activities || [],
    months: x.months || 12, lines: [], goals: [], after, starts: ym(start),
  }
}
const kindOf = (acts?: Activity[]) => { const a = acts?.[0]; return !a ? 'other' : a.kind === 'learning' ? 'school' : a.kind === 'working' ? 'work' : a.kind }

/** After a phase. If something already comes after it, this is another option beside it. */
export function addAfter(doc: LifeDoc, fromId: string, x: NewPhase, start?: number): { doc: LifeDoc; id: string } {
  const next = clone(doc), from = byId(next, fromId)!
  const k = kids(next, fromId)
  const at = start ?? (k.length ? starts(k[0]) : Math.max(thisMonthIndex() + 1, starts(from) + Math.max(1, from.months || 12)))
  const p = make(from, x, [fromId], Math.max(at, starts(from) + 1))
  next.phases.push(p)
  return { doc: normalize(next), id: p.id }
}
/** Before the first phase: the learner's backstory. */
export function addBefore(doc: LifeDoc, firstId: string, x: NewPhase): { doc: LifeDoc; id: string } {
  const next = clone(doc), first = byId(next, firstId)!
  const p = make(first, x, [], starts(first) - 36)
  next.phases.push(p); first.after = [p.id]
  return { doc: normalize(next), id: p.id }
}
/** Between two linked phases, halfway (and never before today, for what's still to come). */
export function addBetween(doc: LifeDoc, fromId: string, toId: string, x: NewPhase): { doc: LifeDoc; id: string } {
  const next = clone(doc), from = byId(next, fromId)!, to = byId(next, toId)!
  const lo = Math.max(starts(from), Math.min(thisMonthIndex(), starts(to) - 2)), hi = starts(to)
  const p = make(from, x, [fromId], Math.min(hi - 1, Math.max(starts(from) + 1, lo + Math.max(1, Math.floor((hi - lo) / 2)))))
  next.phases.push(p)
  to.after = (to.after || []).map((id) => (id === fromId ? p.id : id))
  return { doc: normalize(next), id: p.id }
}
/** Can the end phase `fromId` lead into `toId`? Only forward in time, and never in a loop. */
export function canJoin(doc: LifeDoc, fromId: string, toId: string): boolean {
  const f = byId(doc, fromId), t = byId(doc, toId)
  return !!f && !!t && f !== t && starts(t) > starts(f) && !t.after?.includes(f.id) && !ancestors(doc, f.id).includes(t) && !kids(doc, f.id).length
}
export function join(doc: LifeDoc, fromId: string, toId: string): LifeDoc {
  if (!canJoin(doc, fromId, toId)) return doc
  const next = clone(doc)
  byId(next, toId)!.after = [...(byId(next, toId)!.after || []), fromId]
  return normalize(next)
}
/** Give one way into a joined-up phase its own copy, with what comes after it copied too. */
export function split(doc: LifeDoc, id: string, fromId: string): { doc: LifeDoc; id: string } {
  const next = clone(doc)
  const p = byId(next, id)!
  p.after = (p.after || []).filter((x) => x !== fromId)
  const ids = new Map<string, string>()
  const copy = (src: Phase, after: string[]): Phase => {
    const c: Phase = { ...clone(src), id: phaseId(), after, goals: [] }
    ids.set(src.id, c.id); next.phases.push(c)
    kids(doc, src.id).forEach((k) => { if (!ids.has(k.id)) copy(k, [c.id]) })
    return c
  }
  const c = copy(p, [fromId])
  return { doc: normalize(next), id: c.id }
}
/** Take a phase off the map. What came after it now follows what came before it. */
export function remove(doc: LifeDoc, id: string): LifeDoc {
  const next = clone(doc), p = byId(next, id)
  if (!p) return doc
  for (const k of next.phases) if (k.after?.includes(id)) k.after = [...new Set(k.after.flatMap((x) => (x === id ? p.after || [] : [x])))]
  next.phases = next.phases.filter((x) => x.id !== id)
  next.events = next.events.filter((e) => e.phase !== id)
  next.assets = next.assets.filter((a) => a.bought?.phase !== id)
  next.debts = next.debts.filter((d) => d.start?.phase !== id)
  return normalize(next)
}

/* ---------- splits, rejoining and moving ---------- */

/**
 * A split is the options after one phase, keyed by that phase's id. Options can also all follow the
 * same group of phases (a phase added beside one that several ways lead into): that split is keyed
 * by the group, "g:" plus the sorted ids.
 */
export const groupKey = (after: string[]) => `g:${[...after].sort().join(',')}`
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
export function optionsOf(doc: LifeDoc, key: string): Phase[] {
  if (!key.startsWith('g:')) return kids(doc, key)
  const group = key.slice(2).split(',')
  return doc.phases.filter((p) => sameSet(p.after || [], group)).sort(byChoice)
}
/** The split a phase is an option in (to add another option beside it), or null for a first phase. */
export const splitOf = (p: Phase) => !p.after?.length ? null : p.after.length === 1 ? p.after[0] : groupKey(p.after)

/** Everything after a phase, every way. */
export function below(doc: LifeDoc, id: string, seen = new Set<string>()): Set<string> {
  for (const k of kids(doc, id)) if (!seen.has(k.id)) { seen.add(k.id); below(doc, k.id, seen) }
  return seen
}
/** Where a split's options all come back together: the first phase every one of them leads to. */
export function rejoinOf(doc: LifeDoc, options: Phase[]): Phase | undefined {
  if (options.length < 2) return undefined
  const sets = options.map((q) => new Set([q.id, ...below(doc, q.id)]))
  const common = doc.phases.filter((p) => sets.every((s) => s.has(p.id)))
  return common.find((p) => !common.some((q) => q !== p && below(doc, q.id).has(p.id)))
}

/** Another option in a split: beside the other options, as a dashed idea. */
export function addOption(doc: LifeDoc, key: string, x: NewPhase): { doc: LifeDoc; id: string } {
  const next = clone(doc)
  const after = key.startsWith('g:') ? key.slice(2).split(',') : [key]
  const sib = optionsOf(next, key)[0], base = byId(next, after[0])
  const at = sib ? starts(sib) : base ? Math.max(thisMonthIndex() + 1, starts(base) + 12) : thisMonthIndex() + 1
  const p = make(base, x, after, at)
  next.phases.push(p)
  return { doc: normalize(next), id: p.id }
}
/** Where to hang a phase that comes after every option of a split: the end of each (one id, or a group key). */
export function endsKey(doc: LifeDoc, key: string): string | null {
  const all = new Set(optionsOf(doc, key).flatMap((q) => [q.id, ...below(doc, q.id)]))
  const ends = [...all].filter((id) => !kids(doc, id).length)
  return !ends.length ? null : ends.length === 1 ? ends[0] : groupKey(ends)
}
/** A phase every option of a split leads to, after the end of each. */
export function addRejoin(doc: LifeDoc, key: string, x: NewPhase): { doc: LifeDoc; id: string } {
  const next = clone(doc)
  const all = new Set(optionsOf(next, key).flatMap((q) => [q.id, ...below(next, q.id)]))
  const ends = [...all].map((id) => byId(next, id)!).filter((p) => !kids(next, p.id).length)
  if (!ends.length) return { doc, id: '' }
  const p = make(ends[0], x, ends.map((e) => e.id), Math.max(...ends.map((e) => starts(e) + Math.max(1, e.months || 12))))
  next.phases.push(p)
  return { doc: normalize(next), id: p.id }
}

/**
 * What you pick up when you move a phase: it and everything after it in its option, stopping where
 * that meets other ways (those phases stay where they are). `only` takes the phase alone.
 */
export function pieceOf(doc: LifeDoc, id: string, only = false): string[] {
  const set = new Set([id])
  if (!only) for (let grew = true; grew;) {
    grew = false
    for (const p of doc.phases) if (!set.has(p.id) && p.after?.length && p.after.every((a) => set.has(a))) { set.add(p.id); grew = true }
  }
  return [id, ...doc.phases.filter((p) => p.id !== id && set.has(p.id)).map((p) => p.id)]
}
export interface Held { ids: string[]; tail: string | null; linear: boolean }
/** The shape of a piece: where it ends, and whether it is one line (only a line can go in between two phases). */
export function heldShape(doc: LifeDoc, ids: string[]): Held {
  const set = new Set(ids)
  const inside = (id: string) => doc.phases.filter((p) => set.has(p.id) && p.after?.includes(id))
  const tails = ids.filter((id) => !inside(id).length)
  return { ids, tail: tails.length === 1 ? tails[0] : null, linear: tails.length === 1 && ids.every((id) => inside(id).length <= 1) }
}
/** Take a piece off the map. What followed a phase moved alone now follows what came before it. */
export function lift(doc: LifeDoc, id: string, only = false): LifeDoc {
  const next = clone(doc), head = byId(next, id)
  if (!head) return next
  const ids = new Set(pieceOf(next, id, only))
  if (only) for (const k of next.phases) if (k.after?.includes(id)) k.after = [...new Set(k.after.flatMap((a) => (a === id ? head.after || [] : [a])))]
  for (const p of next.phases) if (!ids.has(p.id)) p.after = (p.after || []).filter((a) => !ids.has(a))
  head.after = []
  return next
}
/** Take one line of phases (first to last) off the map; what followed the last now follows what came before the first. */
export function liftLine(doc: LifeDoc, ids: string[]): LifeDoc {
  const next = clone(doc), set = new Set(ids), head = byId(next, ids[0]), tail = ids[ids.length - 1]
  if (!head) return next
  const before = head.after || []
  for (const k of next.phases) if (!set.has(k.id) && k.after?.includes(tail)) k.after = [...new Set(k.after.flatMap((a) => (a === tail ? before : [a])))]
  for (const p of next.phases) if (!set.has(p.id)) p.after = (p.after || []).filter((a) => !set.has(a))
  head.after = []
  return next
}
/**
 * Put a lifted piece back on the map after `at`: as another option there, or in line (between `at`
 * and what follows it). Dates stay in order: if the piece would start before `at`, it and everything
 * after it move later, and so does what follows it in line.
 */
export function place(lifted: LifeDoc, ids: string[], at: string, inline: boolean): LifeDoc {
  // `at` can be a split's key: a new option beside phases that several ways lead into.
  const after = at.startsWith('g:') ? at.slice(2).split(',') : [at]
  if (after.length > 1) inline = false
  const next = clone(lifted), head = byId(next, ids[0]), from = byId(next, after.reduce((a, b) => (starts(byId(next, b)!) > starts(byId(next, a)!) ? b : a)))
  if (!head || !from) return lifted
  const shape = heldShape(next, ids)
  const shiftAll = (list: Phase[], by: number) => list.forEach((p) => { p.starts = ym(starts(p) + by) })
  const gap = starts(from) + 1 - starts(head)
  if (gap > 0) shiftAll(ids.map((id) => byId(next, id)!), Math.max(gap, 12))
  if (inline && shape.linear && shape.tail) {
    const tail = byId(next, shape.tail)!
    for (const b of kids(next, at)) {
      const late = starts(tail) + 1 - starts(b)
      if (late > 0) shiftAll([b, ...[...below(next, b.id)].map((x) => byId(next, x)!)].filter((p) => !ids.includes(p.id)), Math.max(late, 12))
      b.after = (b.after || []).map((x) => (x === at ? shape.tail! : x))
    }
  }
  head.after = after
  return normalize(next)
}
/** A new piece (say, a career's route) that isn't on the map yet: its steps one after another, ready to place. */
export function loosePiece(doc: LifeDoc, steps: RouteStep[], start = thisMonthIndex() + 12): { doc: LifeDoc; ids: string[] } {
  const next = clone(doc), ids: string[] = []
  let at = start, prev: string | null = null
  for (const s of steps) {
    const p = make(undefined, { title: s.title, activities: s.activities, living: s.living, months: Math.round((s.years || 3) * 12) }, prev ? [prev] : [], at)
    next.phases.push(p); ids.push(p.id); prev = p.id; at += Math.round((s.years || 3) * 12)
  }
  return { doc: normalize(next), ids }
}

/** Put a split's options in the learner's order: the first is their first choice. */
export function rank(doc: LifeDoc, order: string[]): LifeDoc {
  const next = clone(doc)
  order.forEach((id, i) => { const p = byId(next, id); if (p) p.rank = i })
  return next
}

/* ---------- careers: the usual ways in, added as ideas ---------- */

export interface CareerLike { code: string; title: string; job_zone?: number | null }
export interface RouteStep { title: string; years?: number; activities?: Activity[]; living?: string | null }
export interface CareerRoute { common?: boolean; why?: string; steps: RouteStep[] }

const plural = (t: string) => t.replace(/s$/, '')
/** "Electrician" from O*NET's "Electricians"; drops "and ..." tails so names stay short. */
export const careerName = (title: string) => plural(title.split(/,| and /)[0].trim())

/**
 * The routes people usually take into a career, from its O*NET job zone. The trades (SOC 47, 49 and
 * 51) start with an apprenticeship. The last step is working in the career, linked to it by code.
 * Shared with the career explorer, so both offer the same routes.
 */
export function routesFor(career: CareerLike): CareerRoute[] {
  const name = careerName(career.title), jz = career.job_zone || 3
  const job: RouteStep = { title: name, years: 3, activities: [{ kind: 'working', career: career.code, career_title: career.title }], living: 'roommates' }
  const school = (title: string, years: number, level: string): RouteStep => ({ title, years, living: level === 'uni' || level === 'grad' ? 'dorm' : 'family', activities: [{ kind: 'learning', level, schools: [] }] })
  if (jz >= 5) return [{ common: true, steps: [school('College', 4, 'uni'), school('Graduate school', 2, 'grad'), job] }]
  if (jz === 4) return [
    { common: true, steps: [school('College', 4, 'uni'), job] },
    { why: 'Cheaper first two years, then transfer', steps: [school('Community college', 2, 'cc'), school('University', 2, 'uni'), job] },
  ]
  if (jz === 3) {
    if (/^(47|49|51)/.test(career.code)) return [
      { common: true, steps: [{ title: `${name} apprentice`, years: 4, living: 'family', activities: [{ kind: 'working', career: career.code, career_title: career.title, apprentice: true }] }, job] },
      { steps: [school('Trade school', 1, 'trade'), job] },
    ]
    return [
      { common: true, why: 'A short program at a community college or training center', steps: [school('Certificate program', 1, 'trade'), job] },
      { why: 'An associate degree, which can also count toward a 4-year degree later', steps: [school('2-year degree', 2, 'cc'), job] },
      { why: 'Some people start in a related job', steps: [{ title: 'Entry job', years: 2, living: 'roommates', activities: [{ kind: 'working' }] }, job] },
    ]
  }
  return [
    { common: true, why: 'Most learn on the job', steps: [job] },
    { steps: [school('Short training program', 1, 'trade'), job] },
  ]
}

/**
 * Add a route's steps after a phase as dashed ideas, one after another. If something already comes
 * after that phase, the route is a new option beside it.
 */
export function addRoute(doc: LifeDoc, afterId: string, steps: RouteStep[], start?: number): { doc: LifeDoc; ids: string[] } {
  let next = doc, from = afterId
  const ids: string[] = []
  const after = byId(doc, afterId)
  const k = after ? kids(doc, afterId) : []
  let at = start ?? (after ? (k.length ? starts(k[0]) : Math.max(thisMonthIndex() + 1, starts(after) + Math.max(1, after.months || 12))) : thisMonthIndex() + 1)
  for (const s of steps) {
    const r = addAfter(next, from, { title: s.title, activities: s.activities, living: s.living, months: Math.round((s.years || 3) * 12) }, at)
    next = r.doc; from = r.id; ids.push(r.id)
    at += Math.round((s.years || 3) * 12)
  }
  return { doc: next, ids }
}
