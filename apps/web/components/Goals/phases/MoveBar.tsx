'use client'

import React from 'react'
import { Move } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LifeDoc } from '@services/life/life'
import { byId } from './graph'

import { tr } from '@/lib/tr'
/** A piece being moved: a phase on the map (and what follows it in its option), or a new route waiting to be placed. */
export type Moving = { head: string; only: boolean; label?: string; loose?: { doc: LifeDoc; ids: string[] }; dragging?: boolean; fresh?: boolean; route?: boolean }

export default function MoveBar({ doc, ids, moving, hidden, onCancel }: { doc: LifeDoc; ids: string[]; moving: Moving; hidden: boolean; onCancel: () => void }) {
  const head = byId(doc, ids[0]), more = ids.length - 1
  return <div role="region" aria-label={tr('goals.move_bar.moving', 'Moving')} style={{ zIndex: 'var(--z-modal)' }} className={cn('fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] mx-auto grid max-w-[560px] gap-2 rounded-[22px] bg-foreground p-3.5 text-background shadow-2xl transition-opacity', hidden && 'pointer-events-none opacity-0')}>
    <div className="flex items-center gap-2.5">
      <Move size={18} aria-hidden="true" className="shrink-0" />
      <div className="min-w-0"><b className="block truncate text-sm">{moving.route ? tr('goals.move_bar.where_should_label_go', 'Where should {{label}} go?', { label: moving.label }) : moving.label || `Moving ${head?.title || ''}${more ? ` and the ${more === 1 ? 'phase' : `${more} phases`} after it` : ''}`}</b></div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onCancel} className="ml-auto rounded-full bg-background/15 px-3 py-1.5 text-xs font-extrabold">{tr('goals.goal_stages.cancel', 'Cancel')}</button>
    </div>
  </div>
}
