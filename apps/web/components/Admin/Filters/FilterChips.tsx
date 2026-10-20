'use client'

import React from 'react'
import { X } from '@phosphor-icons/react'
import type { FiltersState } from './useFilters'

/** One removable chip per applied filter, then Clear all. Renders nothing while no filter is applied. */
export default function FilterChips({ filters }: { filters: FiltersState }) {
  if (!filters.applied.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Applied filters">
      {filters.applied.map((chip) => (
        <span key={chip.key} className="inline-flex min-h-[28px] items-center gap-1 rounded-full bg-violet-100 py-0.5 pl-2.5 pr-1 text-[13px] font-medium text-violet-800">
          <span>{chip.label}</span>
          <button type="button" onClick={() => filters.clear(chip.key)} aria-label={`Remove filter: ${chip.label}`} className="inline-grid h-6 w-6 place-items-center rounded-full hover:bg-violet-200">
            <X size={13} weight="bold" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button type="button" onClick={filters.clearAll} className="ml-1 text-[13px] font-semibold text-violet-700 underline underline-offset-2">Clear all</button>
    </div>
  )
}
