'use client'

import React from 'react'
import { Award } from 'lucide-react'
import { GoalIconMark } from '@components/Goals/goalIcons'
import { planPalette } from '@components/Goals/planColors'
import type { GoalIcon } from '@services/goals/types'
import { cn } from '@/lib/utils'

export type MedalSource = { image_url?: string | null; icon?: GoalIcon | null; color?: string | null; template_uuid?: string }

/** The color a badge's medal takes: its plan's. */
export const medalColor = (badge: MedalSource) => planPalette(badge.color || 'blue').deep

/** A badge's medal: its image, or one made from its plan's color and icon. Size it with ``size`` (px) or the ``--s`` variable. */
export function BadgeMedal({ badge, size, className }: { badge: MedalSource; size?: number; className?: string }) {
  const style = { ...(size ? { '--s': `${size}px` } : {}), '--mc': medalColor(badge) } as React.CSSProperties
  if (badge.image_url) return <span className={cn('badge-medal badge-medal-image', className)} style={style}><img src={badge.image_url} alt="" /></span>
  return <span className={cn('badge-medal', className)} style={style} aria-hidden="true">
    {badge.icon ? <GoalIconMark icon={badge.icon} size={Math.round((size || 64) * 0.46)} /> : <Award />}
  </span>
}
