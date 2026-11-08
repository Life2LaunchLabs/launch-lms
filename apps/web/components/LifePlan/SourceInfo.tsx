'use client'

import React from 'react'
import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import type { Estimate } from '@services/life/life'
import { isWide } from './EstimatesDialog'

import { tr } from '@/lib/tr'

/** The info mark beside an estimate: where it comes from, in a pop-up rather than in the flow. */
export default function SourceInfo({ est, extra, label }: { est: Estimate; extra?: React.ReactNode; label?: string }) {
  const wide = isWide(est)
  return (
    <Popover>
      <PopoverTrigger type="button" className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={label || tr('budget.budget_table.where_this_comes_from', 'Where this comes from')}>
        <span className="inline-flex items-start">{wide ? <span className="-mr-0.5 text-[11px] leading-none" aria-hidden="true">*</span> : null}<Info className="size-4" /></span>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[min(20rem,calc(100vw-2rem))] space-y-1.5 p-3 text-xs leading-relaxed text-muted-foreground">
        <p><b className="text-foreground">{est.label}</b>{est.place_label ? `, ${est.place_label}` : ''}.</p>
        <p>{est.source.title}, {est.source.publisher}{est.source.released ? ` (${est.source.released})` : ''}. {est.source.dataset}.</p>
        {est.scaled_by ? <p>{tr('budget.budget_table.at_local_prices', 'At local prices:')}{' '}{est.scaled_by.source.title}, {est.scaled_by.source.publisher}. {est.scaled_by.label}: {est.scaled_by.value.toFixed(1)}.</p> : null}
        {wide ? <p>{tr('budget.budget_table.not_for_value_itself_this', ' * Not for {{value}} itself: this is the {{value2}} figure.', { value: est.asked_place_label || tr('budget.budget_table.your_city', 'your city'), value2: est.level === 'us' ? tr('budget.budget_table.national', 'national') : tr('budget.budget_table.state', 'state') }).trim()}</p> : null}
        {extra}
        {est.source.notes ? <p>{est.source.notes}</p> : null}
        {est.source.url ? <a className="inline-block font-semibold text-[var(--org-primary-color)] underline dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]" href={est.source.url} target="_blank" rel="noreferrer">{tr('budget.budget_table.see_the_source', 'See the source')}</a> : null}
      </PopoverContent>
    </Popover>
  )
}
