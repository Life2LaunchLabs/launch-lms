'use client'

import React from 'react'

/*
 * The way through the plan the learner is looking at: which option each split shows, by split key.
 * A split nobody picked shows its first choice. Every date in the plans pages follows this way, so
 * it lives in one place, remembered on this device, and the map, a phase page and the budget agree.
 */

export type Shown = Record<string, string>

const KEY = 'plans-map-shown'
const EMPTY: Shown = {}
let shown: Shown | null = null
const listeners = new Set<() => void>()

const read = (): Shown => {
  if (typeof window === 'undefined') return EMPTY
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

/** The way being looked at right now. */
export function getShown(): Shown {
  if (shown === null) shown = typeof window === 'undefined' ? EMPTY : read()
  return shown
}

/** Look at another way: every split in `next` replaces what it showed. */
export function setShown(next: Shown) {
  shown = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* not kept on this device */ }
  listeners.forEach((fn) => fn())
}
export const showOption = (key: string, id: string) => setShown({ ...getShown(), [key]: id })

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The way being looked at, updating when any page changes it. */
export function useShown(): Shown {
  return React.useSyncExternalStore(subscribe, getShown, () => EMPTY)
}
