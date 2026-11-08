import { describe, expect, test } from 'bun:test'
import { convert, curve, ordinal, pctOf, points, snap, valueAt } from '../payDist'

const est = { value: 18, period: 'hr' as const, percentiles: { p10: 14, p25: 16, p50: 18, p75: 21, p90: 26 } }

describe('pay distribution', () => {
  test('percentiles in the unit asked for, full time for a year', () => {
    expect(points(est, 'hr')).toEqual([[10, 14], [25, 16], [50, 18], [75, 21], [90, 26]])
    expect(points(est, 'yr')![2]).toEqual([50, 18 * 2080])
    expect(Math.round((convert(37440, 'yr', 'hr')) * 1000) / 1000).toBe(18)
    expect(points({ ...est, percentiles: null }, 'hr')).toEqual(null)
  })

  test('a number to a percentile and back, between published ones in a straight line', () => {
    const pts = points(est, 'hr')!
    expect(pctOf(18, pts)).toBe(50)
    expect(Math.round((pctOf(19.5, pts)) * 1000) / 1000).toBe(62.5)
    expect(pctOf(5, pts)).toBe(10)
    expect(pctOf(99, pts)).toBe(90)
    expect(Math.round((valueAt(62.5, pts)) * 1000) / 1000).toBe(19.5)
    expect(Math.round((valueAt(70, pts)) * 1000) / 1000).toBe(20.4)
    expect(snap(63, pts)).toBe(65)
    expect(snap(3, pts)).toBe(10)
  })

  test('the curve peaks near the median and is scaled 0 to 1', () => {
    const c = curve(points(est, 'hr')!, 41)
    expect(c[0][0]).toBe(0)
    expect(c[40][0]).toBe(1)
    expect(Math.round((Math.max(...c.map((p) => p[1]))) * 1000) / 1000).toBe(1)
    expect(['1st', '2nd', '3rd', '11th', '12th', '21st', '70th'].join()).toBe([1, 2, 3, 11, 12, 21, 70].map(ordinal).join())
  })
})

describe('pay chart range', () => {
  test('covers both tails and stretches to an extreme number', async () => {
    const { domain } = await import('../payDist')
    const pts = points(est, 'yr')!
    const [lo, hi] = domain(pts)
    expect(lo < pts[0][1] && hi > pts[4][1]).toBe(true)
    expect(domain(pts, 50)[0]).toBe(50)
    expect(domain(pts, 50)[1]).toBe(hi)
  })
})
