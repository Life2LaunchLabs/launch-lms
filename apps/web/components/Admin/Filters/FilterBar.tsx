'use client'

import React from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import FilterChips from './FilterChips'
import FilterPopover from './FilterPopover'
import type { FiltersState } from './useFilters'

export type FilterBarProps = {
  /** From `useFilters(specs)`. */
  filters: FiltersState
  /** The search box's placeholder and label, e.g. "Search plans, badges, requirements or people". */
  placeholder: string
  /** Buttons at the end of the row (Create, Add from marketplace). */
  actions?: React.ReactNode
  /** A line under the chips, e.g. "4 plans · 7 assignments · 2 hidden by filters". */
  summary?: React.ReactNode
  className?: string
}

/**
 * A list's toolbar: a search box, the Filter button with its popover, the tab's own buttons,
 * then the applied filters as removable chips. The search waits a moment after typing before
 * it applies.
 */
export default function FilterBar({ filters, placeholder, actions, summary, className }: FilterBarProps) {
  const [draft, setDraft] = React.useState(filters.query)
  const [applied, setApplied] = React.useState(filters.query)
  // Follow the URL when the search changes from elsewhere (Back, a link).
  if (filters.query !== applied) {
    setApplied(filters.query)
    setDraft(filters.query)
  }
  const { setQuery } = filters
  React.useEffect(() => {
    if (draft.trim() === applied) return
    const timer = window.setTimeout(() => setQuery(draft.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [draft, applied, setQuery])

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <form role="search" onSubmit={(event) => { event.preventDefault(); setQuery(draft.trim()) }} className="min-w-0 flex-[1_1_200px]">
          <label className="flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-3 focus-within:ring-2 focus-within:ring-violet-300">
            <MagnifyingGlass size={16} className="shrink-0 text-gray-500" aria-hidden="true" />
            <input
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500 [&::-webkit-search-cancel-button]:hidden"
            />
            {draft ? (
              <button type="button" onClick={() => { setDraft(''); setQuery('') }} aria-label="Clear search" className="inline-grid h-6 w-6 place-items-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-black">
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </label>
        </form>
        <FilterPopover filters={filters} />
        {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <FilterChips filters={filters} />
      {summary ? <div className="text-[13px] text-gray-500">{summary}</div> : null}
    </div>
  )
}
