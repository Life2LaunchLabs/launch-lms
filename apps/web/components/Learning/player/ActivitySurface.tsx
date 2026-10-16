'use client'

import Link from 'next/link'
import React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ChevronRight, X } from 'lucide-react'
import { VideoPlaybackStatus } from '@components/Learning/LearningBadgeViews'
import { backgroundLook, Celebration, resolveBackground, Scene } from './design'

/** How an activity's X behaves: a plain close by default, or a labelled exit that can ask first and route somewhere. */
export type ActivityExit = { label?: string; confirm?: string; to_page_uuid?: string }

/** A timed page: how far its timer has run (0–1), and tap and hold to move or pause. */
export type TimedPage = {
  fraction: number
  onPrevious?: () => void
  onNext?: () => void
  // eslint-disable-next-line no-unused-vars
  onHold: (held: boolean) => void
}

/** The progress bar: one bar by default, or a segment per page when the activity asks for it or has timed pages. */
function Progress({ pages, pageIndex, settings, timed, onDark }: { pages: any[]; pageIndex: number; settings?: any; timed?: TimedPage; onDark: boolean }) {
  const track = onDark ? 'bg-white/25' : 'bg-muted'
  const segments = settings?.design?.progress === 'segments' || pages.some((item) => Number(item?.design?.auto_advance_ms) > 0)
  if (!segments) {
    const progress = ((pageIndex + 1) / Math.max(1, pages.length)) * 100
    return <div className={`h-2 flex-1 overflow-hidden rounded-full ${track}`}>
      <div className="h-full rounded-full bg-[var(--org-primary-color)] transition-all" style={{ width: `${progress}%` }} />
    </div>
  }
  return <div className="flex h-2 flex-1 gap-1" data-progress="segments">
    {pages.map((item, index) => {
      const fill = index < pageIndex ? 1 : index > pageIndex ? 0 : timed ? timed.fraction : 1
      return <div key={item?.page_uuid || index} className={`h-full flex-1 overflow-hidden rounded-full ${track}`}>
        <div className="h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${Math.round(fill * 100)}%` }} />
      </div>
    })}
  </div>
}

/**
 * The frame every activity plays in: a full-bleed background (colour, gradient and scene),
 * the top bar (X or a labelled exit, Back, progress) and the footer (Continue, with any
 * buttons placed in the footer beside it).
 */
export function LearningActivitySurface({
  pages, page, pageIndex, children, backHref, onBack, actionLabel = 'Continue', actionDisabled, onAction, interactionState,
  className = 'h-dvh', settings, onPrevious, onExit, footer, timed,
}: {
  pages: any[]; page: any; pageIndex: number; children: React.ReactNode; backHref?: string; onBack?: () => void
  actionLabel?: string; actionDisabled?: boolean; onAction?: () => void; interactionState?: any; className?: string
  /** The activity's settings; ``settings.design`` holds its default background, progress style and exit. */
  settings?: any
  /** Steps back along the route the learner already took. */
  onPrevious?: () => void
  /** The configured exit; without it the X just closes. */
  onExit?: () => void
  /** Buttons placed in the footer, beside Continue. */
  footer?: React.ReactNode
  timed?: TimedPage
}) {
  const isVideoPage = page?.page_type === 'video'
  const showVideoControls = isVideoPage && actionDisabled && interactionState?.videoStarted
  const background = isVideoPage ? {} : resolveBackground(page, settings)
  const look = backgroundLook(background)
  const onDark = isVideoPage || look.tone.includes('dark')
  const exit: ActivityExit = settings?.design?.exit || {}
  const chromeButton = `rounded-full p-2 transition ${onDark ? 'text-white hover:bg-white/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
  const holdTimer = React.useRef<number | undefined>(undefined)

  const leave = () => {
    if (exit.confirm && !window.confirm(exit.confirm)) return
    if (onExit && exit.to_page_uuid) onExit()
    else onBack?.()
  }
  const close = backHref && !exit.label && !exit.confirm ? (
    <Link href={backHref} aria-label="Close activity" className={chromeButton}><X size={20} /></Link>
  ) : exit.label ? (
    <button type="button" onClick={leave} className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${onDark ? 'text-white/85 hover:bg-white/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{exit.label}</button>
  ) : (
    <button type="button" onClick={leave} aria-label="Close activity" className={chromeButton}><X size={20} /></button>
  )
  // Timed pages: tap the left third to go back, elsewhere to move on, hold anywhere to pause.
  // Taps on the page's own controls (answers, buttons, fields) stay theirs.
  const side = React.useRef<'previous' | 'next'>('next')
  const press = timed ? {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('button, a, input, textarea, select, label, [role]')) return
      const box = event.currentTarget.getBoundingClientRect()
      side.current = event.clientX - box.left < box.width / 3 ? 'previous' : 'next'
      holdTimer.current = window.setTimeout(() => { holdTimer.current = undefined; timed.onHold(true) }, 250)
    },
    onPointerUp: () => {
      if (holdTimer.current === undefined) { timed.onHold(false); return }
      window.clearTimeout(holdTimer.current); holdTimer.current = undefined
      if (side.current === 'previous') timed.onPrevious?.(); else timed.onNext?.()
    },
    onPointerLeave: () => { if (holdTimer.current === undefined) timed.onHold(false) },
  } : {}

  return (
    <main data-learning-activity-surface className={`relative flex w-full min-w-0 items-center justify-center overflow-hidden px-4 py-4 text-foreground sm:py-6 ${isVideoPage ? 'bg-black' : 'bg-[var(--org-page-background)]'} ${look.tone} ${className}`} style={look.style}>
      <Scene scene={background.scene} intensity={background.intensity} />
      <Celebration key={page?.page_uuid} active={Boolean(page?.design?.celebrate)} />
      <div className={`relative flex h-full min-h-0 w-full min-w-0 flex-none flex-col overflow-hidden ${isVideoPage ? '' : 'max-w-3xl'}`}>
        <div className="relative z-10 shrink-0 px-4">
          <div className={`mx-auto flex h-14 w-full items-center gap-3 ${isVideoPage ? 'max-w-3xl' : ''}`}>
            {close}
            {onPrevious && pageIndex > 0 ? <button type="button" onClick={onPrevious} aria-label="Back" className={chromeButton}><ArrowLeft size={20} /></button> : null}
            <Progress pages={pages} pageIndex={pageIndex} settings={settings} timed={timed} onDark={onDark} />
            <span className={`text-sm font-medium ${onDark ? 'text-white/80' : 'text-muted-foreground'}`}>{pageIndex + 1}/{Math.max(1, pages.length)}</span>
          </div>
        </div>
        <div data-timed-page={timed ? '' : undefined} {...press} className={`relative ${isVideoPage ? 'flex min-h-0 flex-1 items-center justify-center overflow-hidden p-0' : 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-8'} ${timed ? 'select-none' : ''}`}>
          <div className={`${isVideoPage ? 'flex h-full w-full items-center justify-center overflow-hidden' : 'mx-auto flex min-h-full w-full max-w-2xl items-center overflow-visible'}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page?.page_uuid || pageIndex}
                data-learning-page-heading
                tabIndex={-1}
                className={isVideoPage ? 'flex h-full w-full items-center justify-center' : 'w-full'}
                initial={{ x: 36, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {page ? children : <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">No page selected</div>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="relative z-10 shrink-0 px-5 py-4">
          <div className={`mx-auto flex w-full flex-wrap items-center justify-center gap-3 ${isVideoPage ? 'max-w-3xl' : 'max-w-2xl'}`}>
            {showVideoControls ? (
              <VideoPlaybackStatus interactionState={interactionState} pageUuid={page?.page_uuid} allowScrubbing={page?.content?.allow_scrubbing !== false} />
            ) : <>
              {footer}
              <button type="button" onClick={onAction} disabled={actionDisabled} className="inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-[var(--org-primary-color)] px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 disabled:opacity-40 sm:w-auto sm:min-w-40">
                {actionLabel}
                <ChevronRight size={18} />
              </button>
            </>}
          </div>
        </div>
      </div>
    </main>
  )
}
