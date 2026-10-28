'use client'

import React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** One thing the field offers. An action ("Invite …", "Create group …") reads in the brand color. */
export interface PickerSuggestion {
  key: string
  tile: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  action?: boolean
  /** Shown but not pickable, with its sub saying why ("Already has this plan"). */
  disabled?: boolean
  onPick: () => void
}

/** Suggestions under a heading; a group without one is set apart by a rule. */
export interface PickerGroup { heading?: string; items: PickerSuggestion[] }

/** The suggestions that can be picked, in order: Enter takes the first, arrows move through them. */
export const pickable = (groups: PickerGroup[]) => groups.flatMap((group) => group.items.filter((item) => !item.disabled))

/**
 * A search field that collects tokens: picks show as tokens in the field, suggestions list under
 * it in groups, Enter takes the top one and Backspace on an empty field removes the last token.
 * Who uses it for people, groups and email invitations; Staff with a role on each token.
 */
export default function PickerField<T>({ picks, tokenKey, tokenTile, tokenLabel, tokenExtra, onRemove, query, onQuery, groups, placeholder, label, empty, slim, className }: {
  picks: T[]
  tokenKey: (pick: T) => string // eslint-disable-line no-unused-vars
  tokenTile: (pick: T) => React.ReactNode // eslint-disable-line no-unused-vars
  tokenLabel: (pick: T) => string // eslint-disable-line no-unused-vars
  /** After the label: a count, "new", or a role select. */
  tokenExtra?: (pick: T) => React.ReactNode // eslint-disable-line no-unused-vars
  onRemove: (pick: T) => void // eslint-disable-line no-unused-vars
  query: string
  onQuery: (query: string) => void // eslint-disable-line no-unused-vars
  groups: PickerGroup[]
  placeholder: string
  /** The field's name for screen readers. */
  label: string
  /** Shown in place of suggestions when there are none. */
  empty?: React.ReactNode
  /** Without the shadow, and shorter: when the field sits in a card. */
  slim?: boolean
  className?: string
}) {
  const id = React.useId()
  const input = React.useRef<HTMLInputElement>(null)
  const options = pickable(groups)
  const [hot, setHot] = React.useState(0)
  React.useEffect(() => setHot(0), [query, picks.length])
  const hotKey = options[Math.min(hot, options.length - 1)]?.key
  const take = (item: PickerSuggestion) => { item.onPick(); onQuery(''); input.current?.focus() }

  const keys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = options.find((option) => option.key === hotKey)
      if (item) take(item)
    } else if (event.key === 'Backspace' && !query && picks.length) {
      onRemove(picks[picks.length - 1])
    } else if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault()
      setHot((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault()
      setHot((index) => (index - 1 + options.length) % options.length)
    }
  }

  return <div className={cn('space-y-2.5', className)}>
    <label htmlFor={id} className="flex min-h-14 cursor-text flex-wrap items-center gap-1.5 rounded-[18px] border-[1.5px] border-border bg-card px-2.5 py-[9px] transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_0_0_4px_hsl(var(--ring)/0.16)]">
      {picks.map((pick) => <span key={tokenKey(pick)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-[3px] pl-[3px] pr-1 text-[13px] font-semibold animate-in zoom-in-95">
        {tokenTile(pick)}{tokenLabel(pick)}{tokenExtra?.(pick)}
        <button type="button" onClick={(event) => { event.preventDefault(); onRemove(pick) }} aria-label={`Remove ${tokenLabel(pick)}`}
          className="grid h-[22px] w-[22px] place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X size={12} /></button>
      </span>)}
      <input ref={input} id={id} value={query} onChange={(event) => onQuery(event.target.value)} onKeyDown={keys} placeholder={placeholder}
        autoComplete="off" aria-label={label} aria-controls={`${id}-list`} aria-activedescendant={hotKey ? `${id}-${hotKey}` : undefined}
        className="h-[34px] min-w-[150px] flex-1 border-0 bg-transparent px-1 text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
    </label>
    <div id={`${id}-list`} role="listbox" aria-label={`${label}: suggestions`}
      className={cn('overflow-auto rounded-[18px] border border-border bg-card p-1.5', slim ? 'max-h-[260px]' : 'max-h-[420px] shadow-[0_1px_2px_hsl(200_30%_10%/0.06),0_8px_28px_hsl(200_30%_10%/0.08)]')}>
      {groups.some((group) => group.items.length) ? groups.filter((group) => group.items.length).map((group, index) => <React.Fragment key={group.heading || `group-${index}`}>
        {group.heading ? <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">{group.heading}</div>
          : index ? <div className="mx-1 my-1.5 h-px bg-border" /> : null}
        {group.items.map((item) => <button key={item.key} id={`${id}-${item.key}`} type="button" role="option" aria-selected={item.key === hotKey}
          disabled={item.disabled} onClick={() => take(item)}
          className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left disabled:opacity-50', item.key === hotKey ? 'bg-muted' : 'enabled:hover:bg-muted')}>
          {item.tile}
          <span className="flex min-w-0 flex-1 flex-col">
            <b className={cn('truncate text-sm', item.action && 'text-brand-ink')}>{item.title}</b>
            {item.sub ? <span className="truncate text-[12.5px] text-muted-foreground">{item.sub}</span> : null}
          </span>
          {item.key === hotKey ? <kbd className="rounded-md border border-b-2 border-border bg-card px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Enter</kbd> : null}
        </button>)}
      </React.Fragment>) : empty ? <div className="px-3 py-2.5 text-[13.5px] text-muted-foreground">{empty}</div> : null}
    </div>
  </div>
}
