'use client'

import React from 'react'
import { Info, Lock, Pin, PinOff } from 'lucide-react'
import EppReport from '@components/Epp/EppReport'
import type { CardResult, DashboardCard } from '@services/insights/insights'
import { cn } from '@/lib/utils'
import { frame, spanClass, type CardPin } from './InsightCard'

/**
 * A card that shows a record instead of a number: a learner's Education Plan and Profile (PL-7). The record is
 * drawn as its paper copy, always light so screen, capture and print match. A read-only link never carries it.
 */
export default function DocumentCard({ card, result, pin }: { card: DashboardCard; result: CardResult; pin?: CardPin }) {
  return <section className={cn(spanClass(card.span), frame)} aria-label={result.headline} data-testid="insight-card">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold leading-snug tracking-tight text-foreground">{result.headline}</h3>
        {result.subline ? <p className="mt-1 text-[12px] text-muted-foreground">{result.subline}</p> : null}
      </div>
      {result.complete != null ? <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-bold',
        result.complete ? 'bg-[color-mix(in_oklab,var(--viz-up)_12%,transparent)] text-[var(--viz-up)]' : 'bg-muted text-muted-foreground')}>
        {result.complete ? 'Complete' : 'Not complete'}
      </span> : null}
    </header>
    {result.document ? <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-[#fff] px-4 text-[#111] [color-scheme:light] sm:px-6">
      <EppReport report={result.document} />
    </div> : <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-6 text-[13px] text-muted-foreground"><Lock size={14} aria-hidden="true" />The record itself isn&rsquo;t shown here.</p>}
    <footer className="mt-auto flex items-center gap-2 border-t border-border pt-2 text-[12px] text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1 truncate" title={result.definition}><Info size={12} className="shrink-0" aria-hidden="true" /><span className="truncate">{result.definition}</span></span>
      <span className="flex-1" />
      {pin ? <button type="button" onClick={pin.onToggle} aria-pressed={pin.pinned} title={pin.pinned ? 'Unpin from Home' : 'Pin to Home'}
        className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1 font-semibold hover:text-foreground', pin.pinned && 'text-foreground')}>
        {pin.pinned ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}{pin.pinned ? 'Unpin' : 'Pin to Home'}
      </button> : null}
    </footer>
  </section>
}
