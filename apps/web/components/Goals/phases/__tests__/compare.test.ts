import { describe, expect, test } from 'bun:test'
import type { LifeDoc } from '@services/life/life'
import { mi, normalize } from '../graph'
import { gapsOf, howLong, spanOf, waysOf } from '../compare'

const ph = (id: string, title: string, months: number, after: string[] = [], extra: any = {}) => ({ id, title, kind: 'other', months, lines: [], goals: [], after, ...extra })
const map = (): LifeDoc => normalize({
  version: 1, start: '2023-09', lengths: true, debts: [], savings: [], assets: [], events: [],
  phases: [
    ph('hs', 'High school', 48, [], { starts: '2023-09' }),
    ph('gap', 'Gap year', 48, ['hs'], { lines: [{ id: 'l' }] }),
    ph('col', 'College', 12, ['hs'], { undated: true }),
    ph('job', 'Nurse', 36, ['gap', 'col']),
  ] as any,
}, {})

describe('comparing options', () => {
  test('each option runs to where the options meet again; spans cover the options, ten years, or the whole plan', () => {
    const doc = map(), months = () => 12 * 11
    const ways = waysOf(doc, ['gap', 'col'], months)
    expect(ways.map((w) => [w.title, w.piece.map((p) => p.id), w.end - w.start])).toEqual([['Gap year', ['gap'], 48], ['College', ['col'], 48]])
    expect(spanOf(ways, 'options')).toEqual([mi('2027-09'), mi('2031-09')])
    expect(spanOf(ways, 'ten')).toEqual([mi('2027-09'), mi('2037-09')])
    expect(spanOf(ways, 'all')[0]).toBe(mi('2023-09'))
    expect(gapsOf(ways).map((g) => [g.phase.id, g.what])).toEqual([['col', 'date']])
    expect(howLong(18)).toBe('1 year 6 months')
  })
})
