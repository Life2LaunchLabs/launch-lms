'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import type { RoutineAction, RoutinePeriod } from '@services/goals/types'
import { progressText } from '@services/goals/routine'
import { shortDate } from '../path/stepText'

// One colour per named line; the first is the plan's own.
const LINE_COLORS = ['var(--plan-face)', 'hsl(var(--foreground) / 0.55)', '#e9a23b', '#4aa3df', '#c66bd6', '#5cb85c']
const STRIPES = 'repeating-linear-gradient(135deg, var(--plan-face) 0 4px, color-mix(in srgb, var(--plan-face) 45%, transparent) 4px 8px)'

type Props = {
  action: RoutineAction
  periods: RoutinePeriod[]
  current: string
  selected: string
  // eslint-disable-next-line no-unused-vars
  onSelect: (start: string) => void
}

/** Each column is one time the routine came round; tapping it opens that time's action below. */
export function RoutineChart({ action, periods, current, selected, onSelect }: Props) {
  const series = action.series?.length ? action.series : ['']
  return <div className="flex flex-col gap-1">
    <div className="relative h-24">
      <div className="absolute inset-0 flex items-end gap-1" role="group" aria-label="Past times">
        {periods.map((period) => {
          const on = period.start === selected
          const met = period.done >= period.wanted
          const now = period.start === current
          const label = `${now ? 'Now' : shortDate(period.start)}: ${progressText(action, period.done, period.wanted)}`
          return <button key={period.start} type="button" onClick={() => onSelect(period.start)} aria-label={label} aria-pressed={on} title={label}
            className={cn('flex h-full min-w-0 flex-1 flex-col justify-end rounded-md p-0.5 transition hover:bg-muted/70', on && 'bg-muted ring-2 ring-[var(--plan-face)]/40')}>
            {action.kind === 'number' ? null : <span className={cn('block w-full rounded-[4px]', met ? 'bg-[var(--plan-face)]' : period.done ? 'bg-[color-mix(in_srgb,var(--plan-face)_45%,transparent)]' : 'bg-border')}
              style={{ height: `${period.done ? Math.max(10, Math.min(100, (period.count / Math.max(1, period.wanted)) * 100)) : 6}%`, ...(now && !met ? { backgroundImage: STRIPES } : {}) }} />}
          </button>
        })}
      </div>
      {action.kind === 'number' ? <Lines periods={periods} series={series} /> : null}
    </div>
    <div className="flex justify-between text-[11px] font-bold text-muted-foreground" aria-hidden="true">
      <span>{periods.length > 1 ? shortDate(periods[0].start) : ''}</span><span>Now</span>
    </div>
    {action.kind === 'number' && series.length > 1 ? <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
      {series.map((name, index) => <span key={name} className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-full" style={{ background: LINE_COLORS[index % LINE_COLORS.length] }} />{name}</span>)}
    </div> : null}
  </div>
}

/** A number routine's values as lines, one per series, each on its own scale (a person's
 * weight and a dog's don't share one); gaps where nothing was logged. */
function Lines({ periods, series }: { periods: RoutinePeriod[]; series: string[] }) {
  const x = (index: number) => ((index + 0.5) / periods.length) * 100
  const lines = series.map((name, index) => {
    const values = periods.map((period) => period.values?.[name]).filter((value): value is number => typeof value === 'number')
    const low = Math.min(...values)
    const span = Math.max(...values) - low
    // A flat line sits in the middle; otherwise it spans most of the height, leaving room for the dots.
    const y = (value: number) => (span ? 88 - ((value - low) / span) * 76 : 50)
    return {
      name, color: LINE_COLORS[index % LINE_COLORS.length],
      points: periods.map((period, at) => (typeof period.values?.[name] === 'number' ? [x(at), y(period.values[name])] : null)),
    }
  }).filter((line) => line.points.some(Boolean))
  if (!lines.length) return null
  return <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      {lines.map(({ name, color, points }) => {
        const runs: number[][][] = [[]]
        points.forEach((point) => (point ? runs[runs.length - 1].push(point) : runs.push([])))
        return <g key={name}>{runs.filter((run) => run.length > 1).map((run, at) => <polyline key={at} points={run.map(([px, py]) => `${px},${py}`).join(' ')}
          fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}</g>
      })}
    </svg>
    {lines.flatMap(({ name, color, points }) => points.map((point, at) => point ? <span key={`${name}-${at}`} className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ left: `${point[0]}%`, top: `${point[1]}%`, background: color }} /> : null))}
  </div>
}

/** The row's small history: a bar per time, full once its action was done. */
export function RoutineSparkline({ periods }: { periods: RoutinePeriod[] }) {
  return <div className="flex h-5 items-end gap-1" aria-hidden="true">
    {periods.map((period) => <span key={period.start} className={cn('w-2.5 rounded-[3px]', period.done >= period.wanted ? 'bg-[var(--plan-face)]' : 'bg-[color-mix(in_srgb,var(--plan-face)_40%,transparent)]')}
      style={{ height: `${Math.max(15, Math.min(100, (period.done / Math.max(1, period.wanted)) * 100))}%` }} />)}
  </div>
}
