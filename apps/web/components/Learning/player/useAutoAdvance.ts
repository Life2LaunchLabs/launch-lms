'use client'

import React from 'react'
import type { TimedPage } from './ActivitySurface'

/**
 * A page with ``design.auto_advance_ms`` moves on by itself once its timer runs out, if it can
 * (nothing left to answer). Its progress segment fills as the timer runs; holding pauses it.
 */
export default function useAutoAdvance(page: any, ready: boolean, onNext: () => void, onPrevious?: () => void): TimedPage | undefined {
  const duration = Math.max(0, Number(page?.design?.auto_advance_ms) || 0)
  const [fraction, setFraction] = React.useState(0)
  const [held, setHeld] = React.useState(false)
  const elapsed = React.useRef(0)
  const next = React.useRef(onNext)
  React.useEffect(() => { next.current = onNext })

  React.useEffect(() => { elapsed.current = 0; setFraction(0) }, [page?.page_uuid])
  React.useEffect(() => {
    if (!duration || held) return
    let last = performance.now()
    let frame = 0
    let done = false
    const tick = (now: number) => {
      elapsed.current += now - last
      last = now
      const value = Math.min(1, elapsed.current / duration)
      setFraction(value)
      if (value >= 1) {
        if (ready && !done) { done = true; next.current() }
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [duration, held, ready, page?.page_uuid])

  if (!duration) return undefined
  return { fraction, onPrevious, onNext: ready ? onNext : undefined, onHold: setHeld }
}
