'use client'

import React from 'react'
import { Check, Funnel } from '@phosphor-icons/react'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { cn } from '@/lib/utils'
import { filterDefault, isOn } from '@/lib/admin/filters'
import type { FiltersState } from './useFilters'

/**
 * The Filter button (with the number applied) and its popover: one row of options per choice
 * filter, then "Only show" with the yes/no filters, and Clear all / Done.
 */
export default function FilterPopover({ filters, className }: { filters: FiltersState; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const choices = filters.specs.filter((spec) => !spec.bool)
  const toggles = filters.specs.filter((spec) => spec.bool)
  if (!filters.specs.length) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
            filters.count ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300',
            className,
          )}
        >
          <Funnel size={16} aria-hidden="true" />
          <span>Filter</span>
          {filters.count ? <span className="inline-grid h-[19px] min-w-[19px] place-items-center rounded-full bg-violet-600 px-1.5 text-[11px] font-bold text-white" aria-label={`${filters.count} applied`}>{filters.count}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Filters" className="flex max-h-[min(70vh,540px)] w-[min(340px,calc(100vw-32px))] flex-col gap-4 overflow-y-auto rounded-2xl border-gray-200 bg-white p-4 text-black shadow-xl">
        {choices.map((spec) => (
          <section key={spec.key} className="flex flex-col gap-2" aria-label={spec.label}>
            <p className="text-xs font-semibold text-gray-500">{spec.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {(spec.options || []).map((option) => {
                const selected = (filters.values[spec.key] ?? filterDefault(spec)) === option.value
                return <Option key={option.value} selected={selected} onClick={() => filters.set(spec.key, option.value)}>{option.label}</Option>
              })}
            </div>
          </section>
        ))}
        {toggles.length ? (
          <section className="flex flex-col gap-2" aria-label="Only show">
            <p className="text-xs font-semibold text-gray-500">Only show</p>
            <div className="flex flex-wrap gap-1.5">
              {toggles.map((spec) => <Option key={spec.key} selected={isOn(filters.values, spec.key)} onClick={() => filters.toggle(spec.key)}>{spec.label}</Option>)}
            </div>
          </section>
        ) : null}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
          <button type="button" onClick={filters.clearAll} className="text-sm font-semibold text-violet-700 underline underline-offset-2">Clear all</button>
          <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 items-center rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85">Done</button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[34px] max-w-full items-center gap-1.5 rounded-full border px-3 text-left text-[13px] transition-colors',
        selected ? 'border-transparent bg-violet-100 font-semibold text-violet-800' : 'border-gray-200 text-gray-800 hover:border-gray-300',
      )}
    >
      {selected ? <Check size={14} weight="bold" aria-hidden="true" /> : null}
      <span className="truncate">{children}</span>
    </button>
  )
}
