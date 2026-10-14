'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * A placeholder surface in the shape of what is loading. Pages render these where
 * content will land, so it arrives in place instead of blinking in under a spinner.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('rounded-2xl bg-muted motion-safe:animate-pulse', className)} {...props} />
}

/**
 * Shows ``fallback`` while ``ready`` is false, then fades the content in over it.
 * Loads that finish within ``delay`` ms never show the placeholder at all.
 */
export function Reveal({ ready, fallback, delay = 120, className, children }: { ready: boolean; fallback: React.ReactNode; delay?: number; className?: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  const [waited, setWaited] = React.useState(delay <= 0)
  // Set once the placeholder has shown, so content that was already there does not fade in again.
  const [showedFallback, setShowedFallback] = React.useState(false)
  React.useEffect(() => {
    if (ready || delay <= 0) return
    const timer = window.setTimeout(() => setWaited(true), delay)
    return () => window.clearTimeout(timer)
  }, [ready, delay])
  if (!ready && waited && !showedFallback) setShowedFallback(true)
  if (!ready) return waited ? <div className={className} role="status" aria-label="Loading">{fallback}</div> : <div className={className} aria-busy="true" />
  if (!showedFallback || reduceMotion) return <div className={className}>{children}</div>
  return <motion.div className={className} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>{children}</motion.div>
}
