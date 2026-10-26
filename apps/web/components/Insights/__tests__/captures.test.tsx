import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CapturedCards, { frozen, rangeText } from '@components/Insights/CapturedCards'
import type { CardResult } from '@services/insights/insights'

const result: CardResult = {
  measure: 'completion_rate', shape: 'ranked', unit: 'percent', kind: 'rate', direction: 'up', definition: 'Started plans that finished.',
  value: { v: 0.36, n: 11, text: '36%', few: false }, compare: null, columns: [], series: null, more: null,
  rows: [{ key: 'tpl_cl', label: 'Career Launch', v: 0.5, n: 10, text: '50%', few: false, prior: null, change: '', drill: 'plan=tpl_cl', link: { scope: 'plan', key: 'tpl_cl' } }],
  window: { start: '2026-07-28', end: '2026-10-26', preset: '90d' }, as_of: '2026-10-26T00:00:00+00:00', drill: 'all',
  chart: 'bars', charts: ['bars', 'columns', 'table'], headline: 'Career Launch finishes most often', auto_headline: '', subline: 'Completion rate by plan',
}

describe('captured cards', () => {
  test('a frozen card keeps its numbers but has nothing to click into', () => {
    const plain = frozen(result) as CardResult
    expect(plain.drill).toBe(null)
    expect(plain.rows[0].drill).toBe(null)
    expect(plain.rows[0].link).toBe(null)
    expect(plain.rows[0].text).toBe('50%')
    const html = renderToStaticMarkup(<CapturedCards cards={[{ key: 'plans', span: 6, spec: { measure: 'completion_rate', by: 'plan' } }]} results={{ plans: result }} />)
    expect(html).toContain('Career Launch finishes most often')
    expect(html).not.toContain('See who')
    expect(html).not.toContain('href=')
  })

  test('errors pass through, and the date range reads in words', () => {
    const locked = { error: 'locked' as const, errors: [] }
    expect(frozen(locked)).toBe(locked)
    expect(rangeText({ start: '2026-07-28', end: '2026-10-26' })).toBe('Jul 28 – Oct 26, 2026')
    expect(rangeText({ start: '2025-11-01', end: '2026-10-26' })).toBe('Nov 1, 2025 – Oct 26, 2026')
    expect(rangeText({ start: null, end: '2026-10-26' })).toBe('Up to Oct 26, 2026')
  })
})
