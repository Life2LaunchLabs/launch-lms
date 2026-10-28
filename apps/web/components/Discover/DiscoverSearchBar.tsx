'use client'

import React from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { RESOURCE_TYPES } from './ResourceShelves'

export type DiscoverFilters = { type: '' | 'plans' | 'resources'; resourceTypes: string[]; saved: boolean }

export const filtersApplied = (filters: DiscoverFilters) => Boolean(filters.type || filters.resourceTypes.length || filters.saved)

type Props = {
  query: string
  // eslint-disable-next-line no-unused-vars
  onQuery: (query: string) => void
  filters: DiscoverFilters
  // eslint-disable-next-line no-unused-vars
  onFilters: (filters: DiscoverFilters) => void
  showPlans: boolean
  showResources: boolean
  signedIn: boolean
}

/**
 * Discover's search: a full-width field with a filter button beside it. Filters live in
 * the button's menu; chips appear under the field only once a filter is applied.
 */
export default function DiscoverSearchBar({ query, onQuery, filters, onFilters, showPlans, showResources, signedIn }: Props) {
  const [draft, setDraft] = React.useState(query)
  const [lastQuery, setLastQuery] = React.useState(query)
  // Keep the field in step when the URL's query changes from elsewhere (a chip, back button).
  if (query !== lastQuery) { setLastQuery(query); setDraft(query) }
  React.useEffect(() => {
    if (draft.trim() === query) return
    const timer = window.setTimeout(() => onQuery(draft.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [draft, query, onQuery])

  const both = showPlans && showResources
  const resourceFilters = showResources && filters.type !== 'plans'
  const active = [
    ...(filters.type ? [{ key: 'type', label: filters.type === 'plans' ? 'Plans' : 'Resources', clear: () => onFilters({ ...filters, type: '', resourceTypes: filters.type === 'resources' ? [] : filters.resourceTypes }) }] : []),
    ...filters.resourceTypes.map((value) => ({ key: value, label: RESOURCE_TYPES.find((item) => item.value === value)?.label || value, clear: () => onFilters({ ...filters, resourceTypes: filters.resourceTypes.filter((item) => item !== value) }) })),
    ...(filters.saved ? [{ key: 'saved', label: 'Saved', clear: () => onFilters({ ...filters, saved: false }) }] : []),
  ]
  const count = active.length

  return <div className="flex flex-col gap-3">
    <form role="search" onSubmit={(event) => { event.preventDefault(); onQuery(draft.trim()) }} className="flex gap-2">
      <label className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 transition-colors focus-within:border-[var(--org-primary-color)]">
        <Search size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={both ? 'Search plans and resources' : showResources ? 'Search resources' : 'Search plans'} aria-label="Search Discover" className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" />
        {draft ? <button type="button" onClick={() => { setDraft(''); onQuery('') }} aria-label="Clear search" className="rounded-full p-1 text-muted-foreground hover:bg-raised hover:text-foreground"><X size={16} /></button> : null}
      </label>
      {both || showResources ? <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={count ? `Filters, ${count} applied` : 'Filters'} className={cn('relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 bg-card transition-colors hover:bg-raised', count ? 'border-[var(--org-primary-color)] text-foreground' : 'border-border text-muted-foreground')}>
            <SlidersHorizontal size={20} />
            {count ? <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--org-primary-color)] px-1 text-[11px] font-extrabold text-[var(--org-on-primary-color)]">{count}</span> : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {both ? <>
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={filters.type || 'all'} onValueChange={(value) => onFilters({ ...filters, type: value === 'all' ? '' : value as DiscoverFilters['type'], resourceTypes: value === 'plans' ? [] : filters.resourceTypes, saved: value === 'plans' ? false : filters.saved })}>
              <DropdownMenuRadioItem value="all">Everything</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="plans">Plans</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="resources">Resources</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </> : null}
          {resourceFilters ? <>
            {both ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>Resource type</DropdownMenuLabel>
            {RESOURCE_TYPES.map((type) => <DropdownMenuCheckboxItem key={type.value} checked={filters.resourceTypes.includes(type.value)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => onFilters({ ...filters, resourceTypes: checked ? [...filters.resourceTypes, type.value] : filters.resourceTypes.filter((item) => item !== type.value) })}>{type.label}</DropdownMenuCheckboxItem>)}
            {signedIn ? <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={filters.saved} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => onFilters({ ...filters, saved: Boolean(checked) })}>Saved only</DropdownMenuCheckboxItem>
            </> : null}
          </> : null}
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </form>
    {count ? <div className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
      {active.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} aria-label={`Remove filter ${chip.label}`} className="flex h-8 items-center gap-1.5 rounded-full border-2 border-[var(--org-primary-color)] bg-card pl-3 pr-2 text-sm font-bold hover:bg-raised">{chip.label}<X size={14} aria-hidden="true" /></button>)}
      {count > 1 ? <button type="button" onClick={() => onFilters({ type: '', resourceTypes: [], saved: false })} className="h-8 px-2 text-sm font-bold text-muted-foreground hover:text-foreground">Clear all</button> : null}
    </div> : null}
  </div>
}
