'use client'

import React from 'react'

export type FilterChip<T extends string = string> = {
  id: T
  label: string
  count?: number
}

export default function FilterChips<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = 'Filter',
  className = '',
}: {
  value: T
  options: Array<FilterChip<T>>
  onChange: React.Dispatch<T>
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={`${className} flex gap-2 overflow-x-auto pb-1`} aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = value === option.id
        return (
          <button
            type="button"
            key={option.id}
            onClick={() => onChange(option.id)}
            aria-pressed={selected}
            className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${selected ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground hover:bg-muted'}`}
          >
            {option.label}
            {option.count !== undefined ? <span className="ml-1.5 opacity-70">{option.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
