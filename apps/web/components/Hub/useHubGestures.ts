'use client'

import { useEffect, useRef, type RefObject } from 'react'
import type { HubCoachState } from './HubContext'

const EDGE_ZONE = 24
const COMMIT = 64
const LOCK = 10

/**
 * Phone swipes between the page and Hub. Swipe left from the right edge (or on the edge
 * strip) to bring Hub out; swipe right on the page strip to put the page back. Drags
 * update CSS variables on the shell so the page and Hub follow the finger without
 * re-rendering; only the release changes state. Vertical scrolling and carousels are
 * untouched because a drag must start in one of those two zones and move sideways first.
 */
export default function useHubGestures({ enabled, state, shellRef, onOpen, onTuck }: { enabled: boolean; state: HubCoachState; shellRef: RefObject<HTMLElement | null>; onOpen: () => void; onTuck: () => void }) {
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    const shell = shellRef.current
    if (!enabled || !shell) return
    let start: { x: number; y: number; id: number; mode: 'open' | 'tuck' } | null = null
    let locked = false
    let dx = 0
    const width = () => window.innerWidth - 64

    const set = (value: number) => {
      dx = value
      shell.style.setProperty('--hub-drag', `${value}px`)
      const progress = start?.mode === 'open' ? Math.min(1, -value / width()) : 1 - Math.min(1, value / width())
      shell.style.setProperty('--hub-fade', String(progress))
    }
    const reset = () => {
      start = null; locked = false; dx = 0
      delete shell.dataset.dragging
      shell.style.removeProperty('--hub-drag')
      shell.style.removeProperty('--hub-fade')
    }

    const down = (event: PointerEvent) => {
      if (event.button > 0) return
      const target = event.target as HTMLElement
      const current = stateRef.current
      if (current === 'open' && target.closest('[data-hub-page-strip]')) start = { x: event.clientX, y: event.clientY, id: event.pointerId, mode: 'tuck' }
      else if (current !== 'open' && (target.closest('[data-hub-edge]') || (event.pointerType === 'touch' && event.clientX > window.innerWidth - EDGE_ZONE))) start = { x: event.clientX, y: event.clientY, id: event.pointerId, mode: 'open' }
    }
    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return
      const x = event.clientX - start.x
      const y = event.clientY - start.y
      if (!locked) {
        if (Math.abs(x) < LOCK && Math.abs(y) < LOCK) return
        if (Math.abs(y) > Math.abs(x)) { reset(); return }
        locked = true
        shell.dataset.dragging = 'true'
      }
      set(start.mode === 'open' ? Math.max(-width(), Math.min(0, x)) : Math.max(0, Math.min(width(), x)))
    }
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return
      const mode = start.mode
      const moved = locked
      const distance = dx
      reset()
      if (!moved) return
      // A drag swallows the click that would otherwise follow it on the strip or edge.
      const swallow = (click: MouseEvent) => { click.stopPropagation(); click.preventDefault() }
      window.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 350)
      if (mode === 'open' && distance < -COMMIT) onOpen()
      if (mode === 'tuck' && distance > COMMIT) onTuck()
    }
    const cancel = (event: PointerEvent) => { if (start && event.pointerId === start.id) reset() }

    document.addEventListener('pointerdown', down, { passive: true })
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancel)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
      reset()
    }
  }, [enabled, onOpen, onTuck, shellRef])
}
