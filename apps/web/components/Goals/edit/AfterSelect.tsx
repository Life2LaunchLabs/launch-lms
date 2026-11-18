'use client'

import React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'

import { tr } from '@/lib/tr'

type Other = { id: string; title: string }

/**
 * The steps this one waits for (FEED-179). The chosen ones show as chips; the rest stay in a list that
 * opens on demand, each title whole and wrapping, instead of a wall of cut-off chips for every step.
 */
export default function AfterSelect({ others, value, onChange, id }: { others: Other[]; value: string[]; onChange: (after: string[]) => void; id?: string }) { // eslint-disable-line no-unused-vars
  const [open, setOpen] = React.useState(false)
  if (!others.length) return null
  const name = (other: Other) => other.title || tr('goals.step_editor.untitled_step', 'Untitled step')
  const chosen = others.filter((other) => value.includes(other.id))
  const toggle = (other: Other) => onChange(value.includes(other.id) ? value.filter((key) => key !== other.id) : [...value, other.id])
  return <div className="flex flex-col gap-1.5">
    {chosen.length ? <ul className="flex flex-wrap gap-1.5">
      {chosen.map((other) => <li key={other.id} className="inline-flex max-w-full items-center gap-1 rounded-[10px] border-2 border-[var(--plan-face,hsl(var(--border)))] bg-card py-0.5 pl-2.5 pr-1 text-xs font-bold">
        <span className="min-w-0 break-words">{name(other)}</span>
        <button type="button" onClick={() => toggle(other)} aria-label={tr('goals.after_select.stop_waiting', 'Stop waiting for {{title}}', { title: name(other) })} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X size={13} /></button>
      </li>)}
    </ul> : null}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className="inline-flex h-9 items-center gap-1.5 self-start rounded-xl border border-border bg-background px-3 text-[13px] font-semibold text-foreground hover:bg-muted">
          {chosen.length ? tr('goals.after_select.change', 'Change') : tr('goals.after_select.any_time', 'Any time · pick steps it waits for')}<ChevronDown size={14} aria-hidden="true" className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-1">
        <ul role="listbox" aria-multiselectable="true" aria-label={tr('goals.step_editor.starts_after', 'Starts after')} className="max-h-72 overflow-auto">
          {others.map((other) => { const on = value.includes(other.id); return <li key={other.id} role="option" aria-selected={on}>
            <button type="button" onClick={() => toggle(other)} className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
              <span aria-hidden="true" className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border-2', on ? 'border-foreground bg-foreground text-background' : 'border-border')}>{on ? <Check size={11} strokeWidth={3.5} /> : null}</span>
              <span className="min-w-0 break-words">{name(other)}</span>
            </button>
          </li> })}
        </ul>
      </PopoverContent>
    </Popover>
  </div>
}
