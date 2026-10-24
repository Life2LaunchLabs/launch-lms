'use client'

import React from 'react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@services/connect/connect'

const stamp = (value: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`).getTime() || 0

/** A chat's messages as feed entries, by when they were written. */
export function feedEntries(messages: ChatMessage[]) {
  return messages.map((message, index) => ({ kind: 'message' as const, message, index, at: stamp(message.creation_date) }))
}

/** Something shown in the timeline beside the messages, at its time: People's cards for what waits on you about someone. */
export interface TimelineItem { key: string; at: string; node: React.ReactNode }

/** A feed's entries with timeline cards slotted in by time (stable, so entries keep their order among themselves). */
export function withTimeline<T extends { at: number }>(entries: T[], timeline: TimelineItem[]) {
  type Entry = T | { kind: 'card'; item: TimelineItem; at: number }
  if (!timeline.length) return entries as Entry[]
  return [...entries, ...timeline.map((item) => ({ kind: 'card' as const, item, at: stamp(item.at) }))].sort((a, b) => a.at - b.at) as Entry[]
}

export type ComposeMode = 'message' | 'staff'

/** Above the composer, for staff: write a message everyone in the chat reads, or one only staff read. */
export function ComposeModeToggle({ mode, onChange }: { mode: ComposeMode; onChange: (mode: ComposeMode) => void }) { // eslint-disable-line no-unused-vars
  const option = (value: ComposeMode, label: string) => <button type="button" aria-pressed={mode === value} onClick={() => onChange(value)}
    className={cn('flex h-7 items-center gap-1 rounded-full px-3 text-xs font-bold transition-colors', mode === value ? value === 'staff' ? 'bg-amber-200 text-amber-950' : 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
    {value === 'staff' ? <Lock size={11} aria-hidden="true" /> : null}{label}
  </button>
  return <div className="flex items-center gap-2 px-1 pb-1.5">
    <div role="group" aria-label="Write a" className="flex rounded-full bg-muted p-0.5">{option('message', 'Message')}{option('staff', 'Staff only')}</div>
    <span className="truncate text-xs text-muted-foreground">{mode === 'staff' ? 'Only staff see this' : 'Everyone in this chat sees this'}</span>
  </div>
}
