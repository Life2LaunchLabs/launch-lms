/**
 * A published pay (or price) distribution from its percentiles: where a number falls in it, the
 * number at a percentile, and a smooth curve to draw. Between published percentiles we interpolate
 * in a straight line; the curve is a log-normal fitted to the median and spread, for drawing only.
 */
import type { Estimate, Unit } from '@services/life/life'
import { fromMonthly, toMonthly } from './model'

export type Pt = [number, number]
/** Hours a week behind a yearly figure: BLS turns hourly pay into yearly at 2,080 hours. */
export const FULL_TIME = 40
const KEYS: [keyof NonNullable<Estimate['percentiles']>, number][] = [['p10', 10], ['p25', 25], ['p50', 50], ['p75', 75], ['p90', 90]]

/** The published percentiles as [percentile, value] in `unit`, lowest first; null with fewer than three. */
export function points(est: Pick<Estimate, 'percentiles' | 'value' | 'period'> | null | undefined, unit: Unit): Pt[] | null {
  const p = est?.percentiles
  if (!p) return null
  const out: Pt[] = []
  for (const [k, n] of KEYS) {
    const v = k === 'p50' ? (p.p50 ?? est!.value) : p[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.push([n, convert(v, est!.period, unit)])
  }
  return out.length >= 3 ? out : null
}

/** A figure from one unit to another, full time for hours. */
export function convert(v: number, from: Unit, to: Unit): number {
  return from === to ? v : fromMonthly(toMonthly(v, from, FULL_TIME), to, FULL_TIME)
}

/** Where `v` falls, as a percentile within the published range (clamped to its ends). */
export function pctOf(v: number, pts: Pt[]): number {
  if (v <= pts[0][1]) return pts[0][0]
  for (let i = 1; i < pts.length; i++) {
    const [a, x] = pts[i - 1], [b, y] = pts[i]
    if (v <= y) return y === x ? b : a + ((v - x) / (y - x)) * (b - a)
  }
  return pts[pts.length - 1][0]
}

/** The value at percentile `q`, interpolated between published ones. */
export function valueAt(q: number, pts: Pt[]): number {
  if (q <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [a, x] = pts[i - 1], [b, y] = pts[i]
    if (q <= b) return x + ((q - a) / (b - a)) * (y - x)
  }
  return pts[pts.length - 1][1]
}

/** The nearest step of 5 inside the published range. */
export const snap = (q: number, pts: Pt[]) => Math.max(pts[0][0], Math.min(pts[pts.length - 1][0], Math.round(q / 5) * 5))

/** The drawing range: a little past the lowest and highest published values. */
export function domain(pts: Pt[]): [number, number] {
  const lo = pts[0][1], hi = pts[pts.length - 1][1], mid = valueAt(50, pts)
  return [Math.max(0, lo - (mid - lo) * 0.35), hi + (hi - mid) * 0.35]
}

/** `n` points of a log-normal density across the domain, x and y both 0 to 1. */
export function curve(pts: Pt[], n = 48): Pt[] {
  const [lo, hi] = domain(pts)
  const mu = Math.log(valueAt(50, pts))
  const a = pts[0], b = pts[pts.length - 1]
  // z of the outer published percentiles (10th and 90th are ±1.2816).
  const z = (q: number) => { const t = Math.sqrt(-2 * Math.log(Math.min(q, 100 - q) / 100)); const r = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t); return q < 50 ? -r : r }
  const sigma = Math.max(0.05, (Math.log(b[1]) - Math.log(a[1])) / (z(b[0]) - z(a[0])))
  const ys: number[] = [], xs: number[] = []
  for (let i = 0; i < n; i++) {
    const v = lo + ((hi - lo) * i) / (n - 1)
    xs.push(i / (n - 1))
    ys.push(v <= 0 ? 0 : Math.exp(-((Math.log(v) - mu) ** 2) / (2 * sigma * sigma)) / v)
  }
  const top = Math.max(...ys) || 1
  return xs.map((x, i) => [x, ys[i] / top])
}

/** "70th", "21st", "92nd", "3rd". */
export function ordinal(n: number): string {
  const r = Math.round(n), t = r % 100
  return `${r}${t >= 11 && t <= 13 ? 'th' : r % 10 === 1 ? 'st' : r % 10 === 2 ? 'nd' : r % 10 === 3 ? 'rd' : 'th'}`
}
