'use client'

import React from 'react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@services/connect/connect'

import { tr } from '@/lib/tr'
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

// The mode picked in each chat, kept in this browser: a chat that loads again (a panel reopening, a
// thread refreshing, a full page load after going Home) must not fall back to Message after a
// staff-only note (FEED-210, FEED-598). Page memory first, then local storage, which can be off.
const keptModes = new Map<string, ComposeMode>()
const storageKey = (conversationUuid: string) => `launchlms.composeMode.${conversationUuid}`
export function keptComposeMode(conversationUuid: string): ComposeMode | undefined {
  const inMemory = keptModes.get(conversationUuid)
  if (inMemory) return inMemory
  try {
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(storageKey(conversationUuid))
    return stored === 'staff' || stored === 'message' ? stored : undefined
  } catch { return undefined }
}
export function keepComposeMode(conversationUuid: string, mode: ComposeMode) {
  keptModes.set(conversationUuid, mode)
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey(conversationUuid), mode)
  } catch { /* storage off: page memory still holds it */ }
}
/** Where the box starts in a chat: the kept pick, else Staff only when your own last message there was staff-only. */
export function startingComposeMode(conversationUuid: string, messages: { mine: boolean; staff_only?: boolean }[] = []): ComposeMode | undefined {
  const kept = keptComposeMode(conversationUuid)
  if (kept) return kept
  const lastMine = [...messages].reverse().find((message) => message.mine)
  return lastMine?.staff_only ? 'staff' : undefined
}

/** Above the composer, for staff: write a message everyone in the chat reads, or one only staff read. */
export function ComposeModeToggle({ mode, onChange }: { mode: ComposeMode; onChange: (mode: ComposeMode) => void }) { // eslint-disable-line no-unused-vars
  const option = (value: ComposeMode, label: string) => <button type="button" aria-pressed={mode === value} onClick={() => onChange(value)}
    className={cn('flex h-7 items-center gap-1 rounded-full px-3 text-xs font-bold transition-colors', mode === value ? value === 'staff' ? 'bg-amber-200 text-amber-950' : 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
    {value === 'staff' ? <Lock size={11} aria-hidden="true" /> : null}{label}
  </button>
  return <div className="flex items-center gap-2 px-1 pb-1.5">
    <div role="group" aria-label={tr('connect.feed.write_a', 'Write a')} className="flex rounded-full bg-muted p-0.5">{option('message', tr('lit.feed.message', 'Message'))}{option('staff', tr('lit.feed.staff_only', 'Staff only'))}</div>
    <span className="min-w-0 text-xs leading-tight text-muted-foreground">{mode === 'staff' ? tr('connect.feed.only_staff_see_this', 'Only staff see this') : tr('connect.feed.everyone_in_this_chat_sees', 'Everyone in this chat sees this')}</span>
  </div>
}
