'use client'
/* eslint-disable no-unused-vars */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export interface ChipMultiSelectOption {
  value: string
  label: string
}

interface ChipMultiSelectProps {
  options: ChipMultiSelectOption[]
  selectedValues: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  displayMode?: 'inline-chips' | 'summary'
}

export default function ChipMultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = 'Select options',
  searchPlaceholder = 'Search options',
  emptyMessage = 'No options yet.',
  disabled = false,
  displayMode = 'inline-chips',
}: ChipMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    searchInputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const selectedOptions = useMemo(() => {
    const optionMap = new Map(options.map((option) => [option.value, option]))
    return selectedValues.map((value) => optionMap.get(value)).filter(Boolean) as ChipMultiSelectOption[]
  }, [options, selectedValues])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const unselectedOptions = options.filter((option) => !selectedValues.includes(option.value))
    if (!normalizedQuery) return unselectedOptions
    return unselectedOptions.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
  }, [options, query, selectedValues])

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value))
      return
    }
    onChange([...selectedValues, value])
    setQuery('')
    searchInputRef.current?.focus()
  }

  const summaryLabel =
    selectedOptions.length > 0
      ? `${selectedOptions.length} selected`
      : placeholder

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        className={`flex min-h-11 w-full items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-colors ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-slate-300'
        }`}
        onClick={() => {
          if (disabled) return
          setOpen(true)
          searchInputRef.current?.focus()
        }}
      >
        {displayMode === 'summary' ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                if (!open) setOpen(true)
              }}
              onFocus={() => {
                if (!disabled) setOpen(true)
              }}
              placeholder={query ? searchPlaceholder : summaryLabel}
              disabled={disabled}
              className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex min-w-[180px] flex-1 items-center gap-2 pt-0.5">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  if (!open) setOpen(true)
                }}
                onFocus={() => {
                  if (!disabled) setOpen(true)
                }}
                placeholder={selectedOptions.length === 0 ? placeholder : searchPlaceholder}
                disabled={disabled}
                className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  <span>{option.label}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleValue(option.value)
                    }}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                    aria-label={`Remove ${option.label}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            if (disabled) return
            setOpen((current) => !current)
            if (!open) searchInputRef.current?.focus()
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400"
          aria-label={open ? 'Close options' : 'Open options'}
        >
          <ChevronDown size={16} className="shrink-0 text-slate-400" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[140] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="max-h-64 overflow-y-auto p-2">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleValue(option.value)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <span>{option.label}</span>
                  </button>
                )
              })
            ) : (
              <div className="px-3 py-6 text-center text-sm text-slate-400">{emptyMessage}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
