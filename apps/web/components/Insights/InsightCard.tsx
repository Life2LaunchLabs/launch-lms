'use client'

import React from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, Info, Lock, Minus } from 'lucide-react'
import { isCardError, type CardOutcome, type CardResult, type DashboardCard } from '@services/insights/insights'
import { cn } from '@/lib/utils'
import { CardBody, type Drill, type LinkFor } from './charts'

const SPAN_CLASS: Record<number, string> = {
  3: 'sm:col-span-6 lg:col-span-3', 4: 'sm:col-span-6 lg:col-span-4', 5: 'sm:col-span-6 lg:col-span-5', 6: 'sm:col-span-6 lg:col-span-6',
  7: 'sm:col-span-12 lg:col-span-7', 8: 'sm:col-span-12 lg:col-span-8', 12: 'sm:col-span-12 lg:col-span-12',
}
export const spanClass = (span: number) => cn('col-span-12', SPAN_CLASS[span] || SPAN_CLASS[6])
const frame = 'flex min-w-0 flex-col gap-3 rounded-[18px] border border-border bg-card p-4 nice-shadow'

/** The change against the comparison: an arrow for its direction, colored only when the change is real and counts as better or worse. */
export function DeltaChip({ compare }: { compare: CardResult['compare'] }) {
  if (!compare || !compare.change) return null
  const sign = compare.change.trim().startsWith('−') || compare.change.trim().startsWith('-') ? 'down' : compare.change.trim().startsWith('+') ? 'up' : 'flat'
  const Icon = !compare.real || sign === 'flat' ? Minus : sign === 'up' ? ArrowUpRight : ArrowDownRight
  return <span title={`Compared with ${compare.against} (${compare.text})`}
    className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[11.5px] font-bold',
      !compare.real ? 'bg-muted text-muted-foreground' : compare.tone === 'good' ? 'bg-[color-mix(in_oklab,var(--viz-up)_12%,transparent)] text-[var(--viz-up)]'
        : compare.tone === 'bad' ? 'bg-[color-mix(in_oklab,var(--viz-down)_12%,transparent)] text-[var(--viz-down)]' : 'bg-muted text-muted-foreground')}>
    <Icon size={12} aria-hidden="true" />{compare.real ? compare.change : 'About the same'}
  </span>
}

export function CardSkeleton({ span }: { span: number }) {
  return <section className={cn(spanClass(span), frame, 'min-h-[150px] animate-pulse')} aria-busy="true">
    <span className="h-4 w-2/3 rounded bg-muted" /><span className="h-3 w-1/2 rounded bg-muted" /><span className="mt-auto h-16 rounded bg-muted" />
  </section>
}

/** One card on a dashboard: the headline sentence, what it shows, the chart, and who is behind it. */
export default function InsightCard({ card, outcome, drill, linkFor }: { card: DashboardCard; outcome: CardOutcome | undefined; drill: Drill; linkFor: LinkFor }) {
  if (!outcome) return <CardSkeleton span={card.span} />
  if (isCardError(outcome)) {
    const locked = outcome.error === 'locked'
    return <section className={cn(spanClass(card.span), frame, 'items-start justify-center border-dashed bg-transparent shadow-none')}>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-foreground">{locked ? <Lock size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />}
        {locked ? 'Needs the See reports permission' : "This card doesn't fit here"}</span>
      <p className="text-[12.5px] text-muted-foreground">{locked ? 'Ask an admin if you need it.' : outcome.errors.map((item) => item.message).join(' ')}</p>
    </section>
  }
  const result = outcome
  const chart = card.spec.chart && card.spec.chart !== 'auto' && result.charts.includes(card.spec.chart) ? card.spec.chart : result.chart
  const isNumber = chart === 'number'
  const seeWho = () => drill(result.drill, result.headline)
  return <section className={cn(spanClass(card.span), frame)} aria-label={result.headline} data-testid="insight-card">
    {isNumber ? <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-snug text-muted-foreground">{result.subline.split(' · ')[0]}</h3>
        <DeltaChip compare={result.compare} />
      </div>
      <CardBody result={result} chart={chart} drill={drill} linkFor={linkFor} />
      <p className="text-[12.5px] leading-snug text-muted-foreground">{result.headline}</p>
    </> : <>
      <header className="min-w-0">
        <h3 className="text-[15px] font-bold leading-snug tracking-tight text-foreground">{result.headline}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground"><DeltaChip compare={result.compare} /><span>{result.subline}</span></p>
      </header>
      <div className="min-w-0">
        {(result.rows.length || result.series?.points.length) ? <CardBody result={result} chart={chart} drill={drill} linkFor={linkFor} />
          : <p className="rounded-xl bg-muted px-3 py-6 text-center text-[13px] text-muted-foreground">Nothing to show for these dates yet.</p>}
      </div>
    </>}
    <footer className="mt-auto flex items-center gap-2 border-t border-border pt-2 text-[12px] text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1 truncate" title={result.definition}><Info size={12} className="shrink-0" aria-hidden="true" /><span className="truncate">{result.definition}</span></span>
      <span className="flex-1" />
      {result.drill ? <button type="button" onClick={seeWho} className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-foreground hover:underline">See who<ChevronRight size={13} aria-hidden="true" /></button> : null}
    </footer>
  </section>
}
