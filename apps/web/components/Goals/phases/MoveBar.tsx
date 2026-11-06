'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { Move } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LifeDoc } from '@services/life/life'
import { byId } from './graph'

/** A piece being moved: a phase on the map (and what follows it in its option), or a new route waiting to be placed. */
export type Moving = { head: string; only: boolean; label?: string; loose?: { doc: LifeDoc; ids: string[] }; dragging?: boolean; fresh?: boolean }

export default function MoveBar({ doc, ids, moving, hidden, onScope, onCancel }: { doc: LifeDoc; ids: string[]; moving: Moving; hidden: boolean; onScope: (only: boolean) => void; onCancel: () => void }) {
  const head = byId(doc, ids[0]), more = ids.length - 1
  return <div role="region" aria-label="Moving" style={{ zIndex: 'var(--z-modal)' }} className={cn('fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] mx-auto grid max-w-[560px] gap-2 rounded-[22px] bg-foreground p-3.5 text-background shadow-2xl transition-opacity', hidden && 'pointer-events-none opacity-0')}>
    <div className="flex items-center gap-2.5">
      <Move size={18} aria-hidden="true" className="shrink-0" />
      <div className="min-w-0"><b className="block truncate text-sm">{moving.label || `Moving ${head?.title || ''}${more ? ` and the ${more === 1 ? 'phase' : `${more} phases`} after it` : ''}`}</b>
        <small className="text-xs opacity-75">Tap a spot on the map, or drag it there. Drop it on a phase to make it an option beside that one.</small></div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {moving.loose ? null : <>
        <button type="button" aria-pressed={!moving.only} onClick={() => onScope(false)} className={cn('rounded-full px-3 py-1.5 text-xs font-extrabold', !moving.only ? 'bg-background text-foreground' : 'bg-background/15')}>With what follows</button>
        <button type="button" aria-pressed={moving.only} onClick={() => onScope(true)} className={cn('rounded-full px-3 py-1.5 text-xs font-extrabold', moving.only ? 'bg-background text-foreground' : 'bg-background/15')}>Just this one</button>
      </>}
      <button type="button" onClick={onCancel} className="ml-auto rounded-full bg-background/15 px-3 py-1.5 text-xs font-extrabold">Cancel</button>
    </div>
  </div>
}
