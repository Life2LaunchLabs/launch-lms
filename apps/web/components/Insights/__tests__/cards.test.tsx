import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import InsightCard, { DeltaChip, spanClass } from '@components/Insights/InsightCard'
import { moveCard } from '@components/Insights/DashboardEditing'
import type { CardResult } from '@services/insights/insights'

const base: CardResult = {
  measure: 'completion_rate', shape: 'ranked', unit: 'percent', kind: 'rate', direction: 'up', definition: 'Started plans that finished.',
  value: { v: 0.36, n: 11, text: '36%', few: false }, compare: null, rows: [], columns: [], series: null, more: null,
  window: { start: '2026-07-28', end: '2026-10-26', preset: '90d' }, as_of: '2026-10-26T00:00:00+00:00', drill: 'all',
  chart: 'bars', charts: ['bars', 'columns', 'table'], headline: 'Career Launch finishes most often, at 50%.', auto_headline: '', subline: 'Completion rate by plan · last 90 days',
}
const row = (key: string, label: string, v: number, extra: object = {}) =>
  ({ key, label, v, n: 10, text: `${Math.round(v * 100)}%`, few: false, prior: null, change: '', drill: `plan=${key}`, link: { scope: 'plan' as const, key }, ...extra })
const noop = () => {}

describe('insight cards', () => {
  test('a ranked card shows the headline, each row as a bar that opens who, and links rows to their dashboard', () => {
    const result = { ...base, rows: [row('tpl_cl', 'Career Launch', 0.5), row('tpl_rr', 'Résumé Ready', 0.2)] }
    const html = renderToStaticMarkup(<InsightCard card={{ key: 'plans', span: 6, spec: { measure: 'completion_rate', by: 'plan' } }} outcome={result} drill={noop}
      linkFor={(item) => `/admin/insights/plan/${item.key}`} />)
    expect(html).toContain('Career Launch finishes most often, at 50%.')
    expect(html).toContain('aria-label="Career Launch: 50%. See who"')
    expect(html).toContain('href="/admin/insights/plan/tpl_cl"')
    // Rates are drawn on a 0 to 100% scale, so a bar's length is its rate.
    expect(html).toContain('width:50%')
    expect(html).toContain('width:20%')
    expect(html).toContain('See who')
  })

  test('a split shows one stacked bar and a labeled count for each part', () => {
    const result: CardResult = { ...base, measure: 'learner_status', shape: 'split', kind: 'count', chart: 'stacked', charts: ['stacked', 'bars', 'table'],
      rows: [row('finished', 'Finished', 4, { text: '4' }), row('quiet', 'Quiet', 5, { text: '5' })], headline: '5 of 9 learners are quiet.' }
    const html = renderToStaticMarkup(<InsightCard card={{ key: 'status', span: 5, spec: { measure: 'learner_status' } }} outcome={result} drill={noop} linkFor={() => null} />)
    expect(html).toContain('aria-label="Quiet: 5. See who"')
    expect(html).toContain('var(--viz-neutral)')
    expect(html).toContain('>Finished<')
  })

  test('a locked card says what it needs instead of failing the dashboard', () => {
    const html = renderToStaticMarkup(<InsightCard card={{ key: 'x', span: 3, spec: { measure: 'plan_reach' } }} outcome={{ error: 'locked', errors: [{ field: 'measure', message: 'Needs See reports' }] }}
      drill={noop} linkFor={() => null} />)
    expect(html).toContain('Needs the See reports permission')
  })

  test('changes are colored only when real, and spans fold to full width on a phone', () => {
    expect(renderToStaticMarkup(<DeltaChip compare={{ v: 0.3, text: '30%', change: '+6 pts', tone: 'good', real: true, against: 'the 90 days before' }} />)).toContain('+6 pts')
    expect(renderToStaticMarkup(<DeltaChip compare={{ v: 0.35, text: '35%', change: '+1 pts', tone: 'flat', real: false, against: 'the 90 days before' }} />)).toContain('About the same')
    expect(spanClass(3)).toContain('col-span-12')
    expect(spanClass(3)).toContain('lg:col-span-3')
  })
})

describe('editing a dashboard', () => {
  const cards = ['a', 'b', 'c'].map((key) => ({ key, span: 6, spec: { measure: 'plan_starts' } }))
  test('cards move one place at a time and stay put at the ends', () => {
    expect(moveCard(cards, 'b', -1).map((card) => card.key)).toEqual(['b', 'a', 'c'])
    expect(moveCard(cards, 'b', 1).map((card) => card.key)).toEqual(['a', 'c', 'b'])
    expect(moveCard(cards, 'a', -1)).toBe(cards)
    expect(moveCard(cards, 'c', 1)).toBe(cards)
  })
})
