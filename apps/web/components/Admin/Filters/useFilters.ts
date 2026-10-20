'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import {
  appliedCount,
  appliedFilters,
  clearFilter,
  clearFilters,
  filterDefaults,
  filterQuery,
  readFilters,
  setFilter,
  SEARCH_KEY,
  toggleFilter,
  type AppliedFilter,
  type FilterSpec,
  type FilterValues,
} from '@/lib/admin/filters'

/* eslint-disable no-unused-vars -- parameter names in a type document the callbacks */
export type FiltersState = {
  specs: readonly FilterSpec[]
  /** Every filter's value by key, and the search under `q`. */
  values: FilterValues
  /** The search, trimmed. */
  query: string
  setQuery: (query: string) => void
  set: (key: string, value: string | boolean) => void
  toggle: (key: string) => void
  clear: (key: string) => void
  /** Resets every filter; the search stays. */
  clearAll: () => void
  applied: AppliedFilter[]
  count: number
}
/* eslint-enable no-unused-vars */

/**
 * One list's filters. By default the values live in the URL query (so a link or Back keeps
 * them); pass `{ syncUrl: false }` to keep them in the component instead.
 * The URL is updated with history.replaceState, which Next's router picks up without a reload.
 */
export function useFilters(specs: readonly FilterSpec[], { syncUrl = true }: { syncUrl?: boolean } = {}): FiltersState {
  const params = useSearchParams()
  const [local, setLocal] = React.useState<FilterValues>(() => filterDefaults(specs))
  const search = params?.toString() || ''
  const values = React.useMemo(() => (syncUrl ? readFilters(specs, new URLSearchParams(search)) : { ...filterDefaults(specs), ...local }), [syncUrl, specs, search, local])

  const apply = React.useCallback((next: FilterValues) => {
    if (!syncUrl) return setLocal(next)
    const query = filterQuery(specs, next, window.location.search)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  }, [syncUrl, specs])

  return {
    specs,
    values,
    query: (values[SEARCH_KEY] || '').trim(),
    setQuery: (query) => apply(setFilter(specs, values, SEARCH_KEY, query)),
    set: (key, value) => apply(setFilter(specs, values, key, value)),
    toggle: (key) => apply(toggleFilter(specs, values, key)),
    clear: (key) => apply(clearFilter(specs, values, key)),
    clearAll: () => apply(clearFilters(specs, values)),
    applied: appliedFilters(specs, values),
    count: appliedCount(specs, values),
  }
}
