'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@components/ui/tooltip'
import type { StatusCategory, StatusCounts } from '@services/assignments/assignments'
import { CATEGORIES, nowAt, segmentTip, totalOf } from '@services/assignments/status'

/** Each category's fill, shared by bars and the legend. */
export const STATUS_FILL: Record<StatusCategory, string> = {
  done: 'bg-good', review: 'bg-brand', behind: 'bg-late', open: 'bg-open', locked: 'status-locked',
}

/**
 * Where learners are, as one bar: complete, awaiting review, behind schedule, open and not open
 * yet, in that order, with a line at "now" between what's past and what's ahead. Every progress
 * bar on the assignments screens is this one, for a whole assignment, a stage, a step or a learner.
 */
export default function StatusBar({ counts, names, unit, now = true, size = 'md', label, className }: {
  counts: StatusCounts
  /** Who is in each category, for the hover tips; counts otherwise. */
  names?: Partial<Record<StatusCategory, string[]>>
  /** What the counts count, for the tips ("steps", "learners"). */
  unit?: string
  now?: boolean
  size?: 'md' | 'lg'
  /** What the bar is about, for screen readers. */
  label?: string
  className?: string
}) {
  const total = totalOf(counts)
  const height = size === 'lg' ? 'h-3.5' : 'h-2.5'
  if (!total) return <span role="img" aria-label={label ? `${label}: nothing yet` : 'Nothing yet'} className={cn('block w-full min-w-0 rounded-md bg-muted', height, className)} />
  const shown = CATEGORIES.filter(({ key }) => counts[key])
  const at = now ? nowAt(counts) : null
  const summary = shown.map(({ key, label: name }) => `${name} ${counts[key]}`).join(', ')
  return <TooltipProvider delayDuration={80}>
    <span role="img" aria-label={label ? `${label}: ${summary}` : summary} className={cn('relative flex w-full min-w-0 gap-0.5', height, className)}>
      {shown.map(({ key, label: name }, index) => <Tooltip key={key}>
        <TooltipTrigger asChild>
          <i style={{ flex: `${counts[key]} 1 0` }} className={cn('block h-full min-w-1 transition-[filter] hover:brightness-110 hover:saturate-110', STATUS_FILL[key],
            shown.length === 1 ? 'rounded-md' : index === 0 ? 'rounded-l-md' : index === shown.length - 1 ? 'rounded-r-md' : '')} />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">{segmentTip(name, counts[key], names?.[key], unit)}</TooltipContent>
      </Tooltip>)}
      {at !== null ? <b aria-hidden="true" className="pointer-events-none absolute -top-1 -bottom-1 -ml-px w-0.5 rounded-sm bg-foreground" style={{ left: `${at * 100}%` }} /> : null}
    </span>
  </TooltipProvider>
}

/** What the bar's colors mean. */
export function StatusLegend({ className }: { className?: string }) {
  return <div className={cn('flex flex-wrap gap-3 text-xs text-muted-foreground', className)}>
    {CATEGORIES.map(({ key, label }) => <span key={key} className="inline-flex items-center gap-1.5">
      <i aria-hidden="true" className={cn('h-2 w-2 rounded-[3px]', STATUS_FILL[key], key === 'locked' && 'border border-border')} />{label}
    </span>)}
  </div>
}
