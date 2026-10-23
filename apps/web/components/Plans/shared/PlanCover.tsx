'use client'

import React from 'react'
import { SafeImage } from '@components/Objects/SafeImage'
import { GoalIconMark } from '@components/Goals/goalIcons'
import { PLAN_PALETTES, planPalette } from '@components/Goals/planColors'
import type { PlanCover as Cover } from '@services/goals/types'
import { cn } from '@/lib/utils'

export type CoverSource = { template_uuid: string; title?: string; thumbnail_image?: string | null; icon?: Cover['icon']; color?: string | null }

/** A plan's color: its own, else one picked from its uuid so it never changes. */
export function coverPalette(plan: CoverSource) {
  if (plan.color) return planPalette(plan.color)
  const seed = [...plan.template_uuid].reduce((total, char) => total + char.charCodeAt(0), 0)
  return PLAN_PALETTES[seed % PLAN_PALETTES.length]
}

/** A plan's cover: its image, else its icon on its color. Sized and rounded by the caller. */
export function PlanCover({ plan, className, iconSize = 24, children }: { plan: CoverSource; className?: string; iconSize?: number; children?: React.ReactNode }) {
  const palette = coverPalette(plan)
  return <span className={cn('relative flex items-center justify-center overflow-hidden', className)}
    style={plan.thumbnail_image ? undefined : { background: palette.deep, color: palette.deepInk }}>
    {plan.thumbnail_image ? <SafeImage src={plan.thumbnail_image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      : <span className="opacity-95" aria-hidden="true"><GoalIconMark icon={plan.icon} size={iconSize} /></span>}
    {children}
  </span>
}

/** Four plan covers in a square 2×2 grid; missing cells stay blank. */
export function CoverGrid({ plans, className, cellClassName = 'rounded-[11px]', blankClassName = '' }: {
  plans: CoverSource[]; className?: string; cellClassName?: string; blankClassName?: string
}) {
  return <span className={cn('grid aspect-square grid-cols-2 grid-rows-2 gap-1.5', className)}>
    {[0, 1, 2, 3].map((index) => plans[index] ? <PlanCover key={plans[index].template_uuid} plan={plans[index]} className={cn('min-h-0 min-w-0', cellClassName)} />
      : <span key={index} className={cn(cellClassName, blankClassName)} />)}
  </span>
}
