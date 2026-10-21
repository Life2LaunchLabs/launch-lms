'use client'

import React from 'react'
import { Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NodeState } from '@services/goals/types'

const RADIUS = 20.4
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** The colour under the node follows the ring: neutral until it sweeps under the node, all colour past three quarters. */
function thickness(state: NodeState, fraction: number) {
  if (state === 'done') return 'var(--plan-edge)'
  if (state === 'waiting') return 'color-mix(in srgb, var(--plan-edge) 45%, hsl(var(--edge)))'
  if (state !== 'started' && state !== 'retry') return 'hsl(var(--edge))'
  const split = fraction <= 0.25 ? 100 : fraction >= 0.75 ? 0 : ((Math.sin(2 * Math.PI * fraction) + 1) / 2) * 100
  return `linear-gradient(to right, hsl(var(--edge)) 0 ${split.toFixed(1)}%, var(--plan-edge) ${split.toFixed(1)}% 100%)`
}

/**
 * A step on the path. The type icon never changes; the state shows as fill, ring and badge:
 * locked is flat, open is the icon alone, started adds a ring as far as the step has got,
 * done is filled, waiting is a muted done with a clock, and needs another go carries a "!".
 * Selected is a size bump, and breathes only while the step is open to work on.
 */
export function PathNode({ state, fraction = 0, icon: Icon, selected = false, size }: { state: NodeState; fraction?: number; icon: React.ElementType; selected?: boolean; size?: number }) {
  const px = size || (selected ? 52 : 44)
  const workable = state === 'open' || state === 'started' || state === 'retry'
  const arc = state === 'started' || state === 'retry' ? Math.max(fraction, 0.04) : 0
  return <span aria-hidden="true" className="relative block shrink-0" style={{ width: px, height: px + 4 }}>
    {state !== 'locked' ? <span className="absolute left-0 top-1 rounded-full" style={{ width: px, height: px, background: thickness(state, fraction) }} /> : null}
    <span
      className={cn(
        'absolute left-0 top-0 grid place-items-center rounded-full transition-[width,height]',
        state === 'locked' && 'bg-muted text-muted-foreground',
        state === 'done' && 'bg-[var(--plan-face)] text-[var(--plan-face-ink)]',
        state === 'waiting' && 'bg-[color-mix(in_srgb,var(--plan-face)_45%,hsl(var(--muted)))] text-[var(--plan-face-ink)]',
        workable && 'bg-card text-[var(--plan-accent)]',
        selected && workable && 'path-node-current',
      )}
      style={{ width: px, height: px }}
    >
      {workable ? <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="22" cy="22" r={RADIUS} fill="none" strokeWidth="3.2" className="stroke-border" />
        {arc ? <circle cx="22" cy="22" r={RADIUS} fill="none" strokeWidth="3.2" strokeLinecap="round" stroke={state === 'retry' ? 'hsl(var(--destructive))' : 'var(--plan-face)'} strokeDasharray={`${(arc * CIRCUMFERENCE).toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`} /> : null}
      </svg> : null}
      <Icon className="relative z-[1]" style={{ width: px * 0.42, height: px * 0.42 }} strokeWidth={2.5} />
    </span>
    {state === 'waiting' ? <span className="absolute -right-1 bottom-0 z-[2] grid place-items-center rounded-full border-2 border-background bg-muted-foreground text-card" style={{ width: Math.max(17, px * 0.42), height: Math.max(17, px * 0.42) }}><Clock3 className="h-[62%] w-[62%]" strokeWidth={3} /></span> : null}
    {state === 'retry' ? <span className="absolute -right-1 bottom-0 z-[2] grid place-items-center rounded-full border-2 border-background bg-destructive text-[11px] font-black leading-none text-white" style={{ width: Math.max(17, px * 0.42), height: Math.max(17, px * 0.42) }}>!</span> : null}
  </span>
}
