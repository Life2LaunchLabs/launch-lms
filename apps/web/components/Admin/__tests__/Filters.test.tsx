import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FilterBar from '@components/Admin/Filters/FilterBar'
import type { FiltersState } from '@components/Admin/Filters/useFilters'
import { appliedCount, appliedFilters, filterDefaults, type FilterSpec, type FilterValues } from '@/lib/admin/filters'

const SPECS: FilterSpec[] = [
  { key: 'source', label: 'Made by', options: [{ value: '', label: 'Anyone' }, { value: 'mine', label: 'Your org' }, { value: 'others', label: 'Other orgs' }] },
  { key: 'badge', label: 'Earns a badge', bool: true },
]

function state(values: FilterValues): FiltersState {
  const noop = () => {}
  return { specs: SPECS, values, query: values.q || '', setQuery: noop, set: noop, toggle: noop, clear: noop, clearAll: noop, applied: appliedFilters(SPECS, values), count: appliedCount(SPECS, values) }
}

describe('the filter bar', () => {
  test('with nothing applied: a search box and a plain Filter button, no chips', () => {
    const html = renderToStaticMarkup(<FilterBar filters={state(filterDefaults(SPECS))} placeholder="Search templates" actions={<button type="button">Create template</button>} />)
    expect(html).toContain('aria-label="Search templates"')
    expect(html).toContain('>Filter<')
    expect(html).not.toContain('applied')
    expect(html).not.toContain('Clear all')
    expect(html).toContain('Create template')
  })

  test('applied filters show their count on the button and a removable chip each', () => {
    const html = renderToStaticMarkup(<FilterBar filters={state({ ...filterDefaults(SPECS), q: 'career', source: 'others', badge: '1' })} placeholder="Search templates" summary="2 templates" />)
    expect(html).toContain('aria-label="2 applied"')
    expect(html).toContain('Made by: Other orgs')
    expect(html).toContain('aria-label="Remove filter: Earns a badge"')
    expect(html).toContain('Clear all')
    expect(html).toContain('value="career"')
    expect(html).toContain('2 templates')
  })
})
