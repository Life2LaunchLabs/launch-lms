/* eslint-disable no-unused-vars -- parameter names in function types */
import type { LifeDoc, Phase } from '@services/life/life'
import type { Projection } from '@components/LifePlan/model'
import { byId, endOf, mi, rejoinOf, routeThrough } from './graph'

/** One option of a split, seen as the way through the map it starts. */
export interface Way {
  id: string
  title: string
  /** The phases of the way, first to last, and the ones that belong to this option (up to where the options meet again). */
  route: Phase[]
  piece: Phase[]
  /** Month indexes: where the way's money starts, where the option starts and ends, where the way's plan ends. */
  t0: number
  start: number
  end: number
  last: number
}

export type Span = 'options' | 'ten' | 'all'

const at = (p: Phase) => mi(p.starts!)

/** The options in `ids` as ways: each one's route, its own phases and its dates. */
export function waysOf(doc: LifeDoc, ids: string[], months: (id: string) => number): Way[] {
  const opts = ids.map((id) => byId(doc, id)).filter(Boolean) as Phase[]
  const meet = rejoinOf(doc, opts)
  return opts.map((q) => {
    const route = routeThrough(doc, q.id)
    const i = route.findIndex((p) => p.id === q.id), j = meet ? route.findIndex((p) => p.id === meet.id) : -1
    const piece = route.slice(i, j > i ? j : undefined)
    const t0 = at(route[0]), tail = route[route.length - 1]
    const last = t0 + months(q.id)
    const end = meet && j > i ? at(meet) : Math.min(last, Math.max(at(tail) + 1, endOf(doc, tail)))
    return { id: q.id, title: q.title, route, piece, t0, start: at(q), end, last }
  })
}

/** The months the chart shows: the options alone, ten years on from the split, or the whole plan. */
export function spanOf(ways: Way[], span: Span): [number, number] {
  const split = Math.min(...ways.map((w) => w.start))
  if (span === 'options') return [split, Math.max(split + 1, ...ways.map((w) => w.end))]
  if (span === 'ten') return [split, split + 120]
  return [Math.min(...ways.map((w) => w.t0)), Math.max(split + 1, ...ways.map((w) => w.last))]
}

/** Savings with what you own rolled in (a car bought isn't money lost), and what's owed, at a month; null off the way's plan. */
export function moneyAt(w: Way, proj: Projection, t: number): { saved: number; owed: number } | null {
  const g = t - w.t0
  if (g < 0 || g > proj.months) return null
  return { saved: (proj.sav[g] ?? 0) + (proj.own[g] ?? 0), owed: proj.debt[g] ?? 0 }
}

/** The phase a way has you in at a month. */
export function phaseAt(w: Way, t: number): Phase | undefined {
  let ph: Phase | undefined
  for (const p of w.route) if (at(p) <= t) ph = p
  return ph
}

/** Money left a month on average while the option lasts (after tax, from the budgets). */
export function leftAMonth(w: Way, proj: Projection): number {
  let sum = 0, n = 0
  for (let t = w.start; t < w.end; t++) { const g = t - w.t0; if (g >= 0 && g < proj.months) { sum += (proj.inn[g] ?? 0) - (proj.out[g] ?? 0); n++ } }
  return n ? sum / n : 0
}

export function howLong(months: number): string {
  const y = Math.floor(months / 12), m = months % 12
  const ys = y ? `${y} year${y > 1 ? 's' : ''}` : '', ms = m ? `${m} month${m > 1 ? 's' : ''}` : ''
  return [ys, ms].filter(Boolean).join(' ') || '1 month'
}

/** What to fill in before the comparison means much: phases of the options with no budget or no start date. */
export function gapsOf(ways: Way[]): { phase: Phase; what: 'budget' | 'date' }[] {
  const seen = new Set<string>(), out: { phase: Phase; what: 'budget' | 'date' }[] = []
  for (const w of ways) for (const p of w.piece) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    if (p.undated) out.push({ phase: p, what: 'date' })
    else if (!p.lines.length) out.push({ phase: p, what: 'budget' })
  }
  return out
}
