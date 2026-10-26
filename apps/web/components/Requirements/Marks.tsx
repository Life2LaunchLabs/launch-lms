'use client'

import React from 'react'
import { Flag } from '@phosphor-icons/react'
import { PlanCover, coverPalette } from '@components/Plans/shared/PlanCover'
import type { CoveragePlan } from '@services/goals/requirements'
import type { Gauge } from '@services/goals/requirementTree'
import { cn } from '@/lib/utils'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * A group's coverage as a ring: each selected plan's share in its color, grey for what's still needed. An "any N"
 * group with N covered reads full.
 */
export function GaugeRing({ gauge, plans, size = 22 }: { gauge: Gauge; plans: Map<string, CoveragePlan>; size?: number }) {
  const radius = 8, circumference = 2 * Math.PI * radius
  const lengths = gauge.segments.map((item) => gauge.need ? (item.count / gauge.need) * circumference : 0)
  const offsets = lengths.map((_, index) => lengths.slice(0, index).reduce((sum, length) => sum + length, 0))
  const label = `${gauge.got} of ${gauge.need} needed covered${gauge.segments.length ? `: ${gauge.segments.map((item) => `${item.count} by ${plans.get(item.plan)?.title || 'a plan'}`).join(', ')}` : ''}`
  return <span className="inline-flex shrink-0 items-center gap-1.5" title={label}>
    <b className={cn('text-xs tabular-nums', gauge.need && gauge.got >= gauge.need ? 'text-gray-900' : 'text-gray-500')}>{gauge.got}/{gauge.need}</b>
    <svg viewBox="0 0 22 22" width={size} height={size} role="img" aria-label={label}>
      <g transform="rotate(-90 11 11)">
        <circle r={radius} cx="11" cy="11" fill="none" stroke="#e5e7eb" strokeWidth="4" />
        {gauge.segments.map((item, index) => {
          const plan = plans.get(item.plan), length = lengths[index]
          return <circle key={item.plan} r={radius} cx="11" cy="11" fill="none" stroke={plan ? coverPalette(plan).face : '#9ca3af'} strokeWidth="4" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offsets[index]} />
        })}
      </g>
    </svg>
  </span>
}

/** The plans covering a requirement, as small covers; an empty square when none of the selected plans do. */
export function PlanMarks({ planUuids, plans, spareNote }: { planUuids: string[]; plans: Map<string, CoveragePlan>; spareNote?: string | null }) {
  if (!planUuids.length) {
    return <span className={cn('inline-block h-4 w-4 shrink-0 rounded-[4px] border-2', spareNote ? 'border-dashed border-gray-300' : 'border-gray-300')}
      title={spareNote || 'Not covered by the selected plans'} role="img" aria-label={spareNote || 'Not covered'} />
  }
  return <span className="flex shrink-0 -space-x-1" role="img" aria-label={`Covered by ${planUuids.map((uuid) => plans.get(uuid)?.title).filter(Boolean).join(', ')}`}>
    {planUuids.slice(0, 4).map((uuid) => { const plan = plans.get(uuid); return plan ? <span key={uuid} title={plan.title}><PlanCover plan={plan} className="h-[18px] w-[18px] rounded-[5px] ring-2 ring-white" iconSize={11} /></span> : null })}
    {planUuids.length > 4 ? <span className="grid h-[18px] min-w-[18px] place-items-center rounded-[5px] bg-gray-100 px-1 text-[10px] font-bold text-gray-600 ring-2 ring-white">+{planUuids.length - 4}</span> : null}
  </span>
}

export function FlagMark({ className }: { className?: string }) {
  return <Flag size={14} weight="fill" className={cn('shrink-0 text-amber-500', className)} aria-label="Flagged" />
}

export { plural }
