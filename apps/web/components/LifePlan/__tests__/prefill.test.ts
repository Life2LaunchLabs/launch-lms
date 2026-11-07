import { describe, expect, test } from 'bun:test'
import type { Catalog, Line, Phase } from '@services/life/life'
import { applyRows, planRows, shareSettings, suggestLines } from '../prefill'

const items = ['job', 'rent', 'utilities', 'dorm', 'groceries', 'transport', 'tuition', 'books', 'going_out', 'phone', 'clothes', 'hobby']
const catalog = { items: items.map((key) => ({ key, cat: 'x', title: key, icon: 'x', metric: key === 'hobby' ? undefined : key, settings: key === 'rent' || key === 'utilities' ? [{ key: 'share', title: 'Split with', kind: 'choice', choices: [[1, 'Just me'], [2, '1 roommate']] }] : [] })), categories: [], metrics: {} } as unknown as Catalog
const phase = (extra: Partial<Phase> = {}): Phase => ({ id: 'p', title: 'College', kind: 'study', months: 12, lines: [], place: 'city:OR:bend', place_label: 'Bend, OR', living: 'roommates', activities: [{ kind: 'learning', level: 'cc', school_id: '208646' }, { kind: 'working', career: '35-3023.01', career_title: 'Baristas' }], ...extra })
const line = (item: string, extra: Partial<Line> = {}): Line => ({ id: `l-${item}`, cat: 'x', item, title: item, side: 'out', settings: {}, start: 0, ...extra })

describe('budget pre-fill', () => {
  test('picks suggest pay, the home, school costs and everyday lines', () => {
    const s = suggestLines(phase(), catalog)
    expect(s.map((x) => x.item)).toEqual(['job', 'rent', 'utilities', 'groceries', 'transport', 'tuition', 'books', 'going_out', 'phone', 'clothes'])
    expect([s[0].side, s[0].settings.soc, s[0].hours]).toEqual(['in', '35-3023', 20])
    expect(s.find((x) => x.item === 'rent')!.settings).toEqual({ share: 2, bedrooms: 2 })
    expect(s.find((x) => x.item === 'tuition')!.settings).toEqual({ school: '208646', residency: 'in' })
  })

  test('a dorm replaces rent, utilities and groceries; working without school is full time', () => {
    const s = suggestLines(phase({ living: 'dorm' }), catalog).map((x) => x.item)
    expect(s).toContain('dorm')
    expect(s).not.toContain('rent')
    expect(s).not.toContain('groceries')
    expect(suggestLines(phase({ activities: [{ kind: 'working', career: '35-3023.01' }] }), catalog)[0].hours).toBe(40)
  })

  test('splitting rent takes a bedroom each, except with a partner', () => {
    expect(shareSettings('roommates', 3)).toEqual({ share: 3, bedrooms: 3 })
    expect(shareSettings('partner')).toEqual({ share: 2, bedrooms: 1 })
    expect(shareSettings('own')).toEqual({ share: 1, bedrooms: 1 })
  })

  test('starting adds every suggested line that is not there yet', () => {
    const rows = planRows(null, phase({ lines: [line('rent', { settings: { share: 2 } })] }), catalog)
    expect(rows.filter((r) => r.kind === 'add').map((r) => r.item)).not.toContain('rent')
    expect(rows.filter((r) => r.kind === 'remove')).toEqual([])
    expect(rows.find((r) => r.item === 'rent')?.kind).toBe('change')
  })

  test('a change removes only lines the old picks suggested', () => {
    const before = phase({ lines: [line('rent'), line('groceries'), line('hobby')] })
    const after = phase({ living: 'dorm', lines: before.lines })
    const rows = planRows(before, after, catalog)
    expect(rows.filter((r) => r.kind === 'remove').map((r) => r.item).sort()).toEqual(['groceries', 'rent'])
    expect(rows.some((r) => r.item === 'hobby')).toBe(false)
    expect(rows.find((r) => r.kind === 'add' && r.item === 'dorm')?.next?.settings).toEqual({ school: '208646', housing: 'on' })
  })

  test('a new school moves the tuition line to it, keeping the learner’s knobs', () => {
    const before = phase({ lines: [line('tuition', { settings: { school: '1', residency: 'in', note: 'x' } })] })
    const rows = planRows(before, phase({ lines: before.lines }), catalog)
    expect(rows.find((r) => r.item === 'tuition')?.next?.settings).toEqual({ school: '208646', residency: 'in', note: 'x' })
  })

  test('a new way of living starts the split over', () => {
    const before = phase({ lines: [line('rent', { settings: { share: 3, bedrooms: 3 } })] })
    expect(planRows(before, phase({ living: 'own', lines: before.lines }), catalog).find((r) => r.item === 'rent')?.next?.settings).toEqual({ share: 1, bedrooms: 1 })
    expect(planRows(before, phase({ lines: before.lines }), catalog).find((r) => r.item === 'rent')?.next?.settings).toEqual({ share: 3, bedrooms: 3 })
  })

  test('applying adds, removes, updates, and keeps the old amount on an unticked line', () => {
    const lines = [line('rent'), line('groceries'), line('phone')]
    const before = phase({ lines })
    const rows = planRows(before, phase({ living: 'dorm', lines }), catalog)
    const on = (r: { kind: string; item: string }) => r.item !== 'phone'
    const out = applyRows(lines, rows, on, (r) => (r.item === 'phone' ? 95.4 : null))
    expect(out.map((l) => l.item)).toContain('dorm')
    expect(out.map((l) => l.item)).not.toContain('rent')
    expect(out.find((l) => l.item === 'phone')?.own).toEqual({ unit: 'mo', value: 95 })
  })
})
