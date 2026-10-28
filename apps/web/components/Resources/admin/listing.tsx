'use client'

import React from 'react'
import { Loader2, Search } from 'lucide-react'
import { RESOURCE_TYPES } from '@services/resources/workspace'
import { cn } from '@/lib/utils'

export function Loading() {
  return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" /></div>
}

/** Search and type chips over a list of resources. */
export function useResourceFilter<T extends { title: string; description: string | null; provider_name: string | null; resource_type: string }>(items: T[]) {
  const [query, setQuery] = React.useState('')
  const [type, setType] = React.useState('all')
  const needle = query.trim().toLowerCase()
  const shown = items.filter((item) => (type === 'all' || item.resource_type === type) && (!needle || `${item.title} ${item.description || ''} ${item.provider_name || ''}`.toLowerCase().includes(needle)))
  const types = RESOURCE_TYPES.filter((option) => items.some((item) => item.resource_type === option.value))
  return { query, setQuery, type, setType, shown, types }
}

export function SearchBox({ value, onChange, label, className }: { value: string; onChange: React.Dispatch<string>; label: string; className?: string }) {
  return <label className={cn('flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-muted-foreground', className || 'w-[180px] sm:w-[240px]')}>
    <Search size={16} aria-hidden="true" />
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} aria-label={label} autoComplete="off"
      className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground" />
  </label>
}

export function TypeChips({ types, value, onChange }: { types: typeof RESOURCE_TYPES; value: string; onChange: React.Dispatch<string> }) {
  if (types.length < 2) return null
  return <div className="mb-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Type">
    {[{ value: 'all', plural: 'All' }, ...types].map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}
      className={cn('rounded-full border px-3 py-1 text-[13px] font-semibold', value === option.value ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted')}>{option.plural}</button>)}
  </div>
}
