'use client'

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { monthLabel, phaseOffset } from './model'

/** Sticky: back to the phase, then which phase and which stretch of it the budget below is showing. */
/** `owner` is set when someone shared their plan with you: their name heads it, and nothing can be changed. */
export default function ContextBar({ saving, owner, onBack, backLabel }: { saving: 'idle' | 'saving' | 'saved' | 'error'; owner?: string; onBack: () => void; backLabel: string }) {
  const { doc, phase, stretch, stretchesOf, selectStretch } = useLife()
  const k = doc.phases.findIndex((p) => p.id === phase.id)
  const off = phaseOffset(doc, phase.id)
  const chips = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const box = chips.current, on = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (box && on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2
  }, [stretch.i, phase.id])
  const go = (d: number) => { const p = doc.phases[k + d]; if (p) selectStretch(p.id, 0) }
  const label = (i: number) => (i === 0 ? 'Start' : stretchesOf[i].why.join(', '))

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border/70 bg-background/90 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={backLabel} title={backLabel}><ChevronLeft /></Button>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{owner ? `${owner}’s budget` : 'Budget'}</h1>
        </div>
        {owner ? <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Shared with you · view only</span>
          : <span className="shrink-0 text-xs text-muted-foreground" aria-live="polite">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : saving === 'error' ? 'Not saved' : ''}</span>}
      </div>
      <div className="mt-2 grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-1 rounded-2xl bg-card p-1 shadow-[0_1px_0_hsl(var(--border))]">
        {k > 0 ? <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label={`Earlier phase: ${doc.phases[k - 1].title}`}><ChevronLeft /></Button> : <span />}
        <div className="min-w-0 text-center leading-tight">
          <div className="truncate font-bold">{phase.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {monthLabel(doc.start, off)} to {monthLabel(doc.start, off + phase.months - 1)}{phase.place_label ? ` · ${phase.place_label}` : ''} · phase {k + 1} of {doc.phases.length}
          </div>
        </div>
        {k < doc.phases.length - 1 ? <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label={`Next phase: ${doc.phases[k + 1].title}`}><ChevronRight /></Button> : <span />}
      </div>
      {stretchesOf.length > 1 && (
        <div ref={chips} className="relative mt-2 flex items-center gap-2 overflow-x-auto px-0.5 py-1 [scrollbar-width:none]" role="group" aria-label="Stretches in this phase">
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 min-w-full bg-border" />
          {stretchesOf.map((s) => {
            const on = s.i === stretch.i
            return (
              <button key={s.i} type="button" aria-pressed={on} onClick={() => selectStretch(phase.id, s.i)} title={`${label(s.i)} · ${monthLabel(doc.start, s.g0)}`}
                className={`relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full p-1 ${on ? 'bg-[var(--org-primary-color)] pr-4 text-[var(--org-on-primary-color)]' : 'bg-card text-muted-foreground ring-1 ring-border hover:text-foreground'}`}>
                <span className="grid size-7 place-items-center rounded-full"><LifeIcon name={s.icon} /></span>
                {on ? <span className="grid text-left leading-tight"><b className="whitespace-nowrap text-sm">{label(s.i)}</b><small className="whitespace-nowrap text-xs opacity-85">{monthLabel(doc.start, s.g0)} to {monthLabel(doc.start, s.g1)}</small></span> : <span className="sr-only">{label(s.i)}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
