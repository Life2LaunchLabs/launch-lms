import type { LifeDoc, Phase } from '@services/life/life'
import { tr } from '@/lib/tr'
import { below, byId, keyAfter, kids, lenOf, mi, normalize, parents, roots, routeThrough, wayOf, ym } from './graph'
import { getShown, type Shown } from './way'

/* ---------- which options the dates follow ---------- */

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const starts = (p: Phase) => (p.starts ? mi(p.starts) : 0)

/** Is this a skip: an option with no phase of its own, that takes no time? */
export const isSkip = (q: Phase) => !!q.pass
/** Where the way being looked at leaves the learner's first choices: each split showing another option. */
export function detours(doc: LifeDoc, shown: Shown = getShown()): { key: string; title: string }[] {
  const out: { key: string; title: string }[] = []
  const seen = new Set<string>()
  let p: Phase | undefined = roots(doc)[0]
  while (p && !seen.has(p.id)) {
    seen.add(p.id)
    const ks = kids(doc, p.id)
    if (!ks.length) break
    const key = keyAfter(p, ks), pick = ks.find((k) => k.id === shown[key]) || ks[0]
    if (pick !== ks[0]) out.push({ key, title: isSkip(pick) ? tr('goals.way.skip_title', 'Skip {{title}}', { title: ks[0].title }) : pick.title })
    p = pick
  }
  return out
}
/** Show the way to a phase: the options it takes to get there, keeping everything else as it was. */
export function showWayTo(doc: LifeDoc, id: string, shown: Shown = getShown()): Shown {
  const on = wayOf(doc, shown), next = { ...shown }
  let x = byId(doc, id)
  const seen = new Set<string>()
  while (x && !on.has(x.id) && !seen.has(x.id)) {
    seen.add(x.id)
    const ps = parents(doc, x), from = ps.find((q) => on.has(q.id)) || ps[0]
    if (!from) break
    const ks = kids(doc, from.id)
    if (ks.length > 1) next[keyAfter(from, ks)] = x.id
    x = from
  }
  return next
}

/* ---------- lengths and dates ---------- */

/** How long a phase lasts, in months. Everything after it moves with its end. */
export function setLength(doc: LifeDoc, id: string, months: number): LifeDoc {
  const next = clone(doc), p = byId(next, id)
  if (!p) return doc
  p.months = Math.max(1, Math.min(1200, Math.round(months)))
  p.undated = false
  return normalize(next)
}
/**
 * When a phase starts. It starts the month the phase before it (on the way being looked at) ends, so
 * this changes that phase's end. A first phase just starts then.
 */
export function setStart(doc: LifeDoc, id: string, month: number): { doc: LifeDoc; changed: Phase | null } {
  const next = normalize(doc), p = byId(next, id)
  if (!p) return { doc, changed: null }
  const on = wayOf(next), back = (x: Phase) => { const ps = parents(next, x); return ps.find((q) => on.has(q.id)) || ps[0] }
  // Skips take no time: the phase that ends is the one before them.
  let from = back(p)
  for (let n = 0; from?.pass && n < 50; n++) from = back(from)
  if (!from) { const root = roots(next).find((r) => r.id === p.id || below(next, r.id).has(p.id)) || p; root.starts = ym(month); return { doc: normalize(next), changed: null } }
  from.months = Math.max(1, Math.min(1200, month - starts(from)))
  from.undated = false
  return { doc: normalize(next), changed: from }
}

/**
 * The plan as one line of phases, the way the budget and its chart read it: the phases on the route
 * through `id`, each as long as it lasts on that route. Money things tied to phases off the route
 * are left out. Change it, then put it back with `mergeRoute`.
 */
export function routeDoc(doc: LifeDoc, id: string): LifeDoc {
  // A skip takes no time and has no budget: the budget's line leaves it out.
  const route = routeThrough(doc, id).filter((p) => !p.pass)
  if (!route.length) return clone(doc)
  const on = new Set(route.map((p) => p.id))
  const phases = route.map((p) => ({ ...clone(p), months: Math.max(1, lenOf(p)) }))
  const keep = (w?: { phase: string } | null) => !w || on.has(w.phase)
  return {
    ...clone(doc),
    start: route[0].starts!,
    phases,
    events: doc.events.filter((e) => on.has(e.phase)).map(clone),
    debts: doc.debts.filter((d) => keep(d.start)).map(clone),
    savings: doc.savings.filter((x) => keep(x.start)).map(clone),
    assets: doc.assets.filter((a) => keep(a.bought) && keep(a.sold)).map(clone),
    policies: (doc.policies || []).filter((x) => on.has(x.phase)).map(clone),
  }
}
/** Put a changed route back into the whole plan. Dates and links stay the map's. */
export function mergeRoute(doc: LifeDoc, route: LifeDoc): LifeDoc {
  const next = clone(doc)
  const on = new Set(route.phases.map((p) => p.id))
  next.phases = next.phases.map((p) => {
    const r = route.phases.find((x) => x.id === p.id)
    if (!r) return p
    // The budget can change how long a phase lasts; a length not picked yet stays unpicked unless it did.
    const changed = r.months !== Math.max(1, lenOf(p))
    return { ...clone(r), starts: p.starts, after: p.after, months: changed ? r.months : p.months, undated: changed ? false : p.undated }
  })
  // Phases added while looking at the route join the map after the one before them.
  route.phases.filter((r) => !next.phases.some((p) => p.id === r.id)).forEach((r) => {
    const i = route.phases.indexOf(r), prev = route.phases[i - 1]
    next.phases.push({ ...clone(r), after: prev ? [prev.id] : [], starts: prev ? null : route.start })
  })
  const offRoute = (w?: { phase: string } | null) => !!w && !on.has(w.phase)
  next.events = [...doc.events.filter((e) => !on.has(e.phase)), ...route.events]
  next.debts = [...doc.debts.filter((d) => offRoute(d.start)), ...route.debts]
  next.assets = [...doc.assets.filter((a) => offRoute(a.bought) || offRoute(a.sold)), ...route.assets]
  next.savings = [...doc.savings.filter((x) => offRoute(x.start)), ...route.savings]
  // What is paid, put in or done with what's left, from a month of a phase on: the route's for its phases.
  next.policies = [...(doc.policies || []).filter((x) => !on.has(x.phase)), ...(route.policies || [])]
  next.card_rate = route.card_rate
  return normalize(next)
}
