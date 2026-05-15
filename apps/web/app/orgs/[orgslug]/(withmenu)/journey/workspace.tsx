'use client'

import { PointerEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { Move, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { cn } from '@/lib/utils'

type BreadcrumbItem = {
  label: string
  href?: string
  icon?: ReactNode
}

export function JourneyWorkspaceHeader({
  breadcrumbs,
  children,
}: {
  breadcrumbs: BreadcrumbItem[]
  children?: ReactNode
}) {
  return (
    <header className="relative z-40 shrink-0 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
      <div className="space-y-3">
        <Breadcrumbs items={breadcrumbs} />
        {children ? <div className="flex min-h-10 flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </header>
  )
}

export function JourneyPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <aside className={cn('flex h-full min-h-0 flex-col bg-white', className)}>
      {children}
    </aside>
  )
}

export function JourneyWorkspaceShell({
  header,
  children,
  panel,
  panelOpen,
  onPanelClose,
  mobilePanelLabel = 'Close details',
  initialPanelWidth = 420,
}: {
  header: ReactNode
  children: ReactNode
  panel?: ReactNode
  panelOpen?: boolean
  onPanelClose?: () => void
  mobilePanelLabel?: string
  initialPanelWidth?: number
}) {
  const [panelWidth, setPanelWidth] = useState(initialPanelWidth)
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  ))
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const handleChange = () => setIsDesktop(media.matches)
    handleChange()
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    resizeRef.current = { startX: event.clientX, startWidth: panelWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current
    if (!drag) return
    setPanelWidth(Math.min(620, Math.max(320, drag.startWidth - (event.clientX - drag.startX))))
  }

  const stopResize = () => {
    resizeRef.current = null
  }

  return (
    <main className="flex h-[100svh] min-h-0 flex-col overflow-hidden bg-gray-50 text-gray-950">
      {header}
      <div className="min-h-0 flex-1 lg:flex">
        <section className="min-w-0 flex-1 overflow-hidden">{children}</section>
        {isDesktop && panelOpen && panel ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              tabIndex={0}
              onPointerDown={startResize}
              onPointerMove={resize}
              onPointerUp={stopResize}
              onPointerCancel={stopResize}
              className="group relative z-20 hidden w-2 shrink-0 cursor-col-resize border-l border-gray-200 bg-white lg:block"
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition group-hover:bg-gray-400" />
            </div>
            <section className="hidden min-h-0 shrink-0 overflow-hidden border-l border-gray-200 bg-white lg:block" style={{ width: panelWidth }}>
              {panel}
            </section>
          </>
        ) : null}
      </div>
      {!isDesktop && panelOpen && panel ? (
        <div className="fixed inset-0 z-max lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/10"
            aria-label={mobilePanelLabel}
            onClick={onPanelClose}
          />
          <section className="absolute inset-x-3 bottom-3 h-[78vh] max-h-[78vh] overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] ring-1 ring-black/5">
            {panel}
          </section>
        </div>
      ) : null}
    </main>
  )
}

export function JourneyCanvasViewport({
  children,
  className,
  contentClassName,
  minZoom = 0.7,
  maxZoom = 1.35,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  minZoom?: number
  maxZoom?: number
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)

  const zoomBy = (delta: number) => {
    setZoom((current) => Math.min(maxZoom, Math.max(minZoom, Number((current + delta).toFixed(2)))))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const viewport = viewportRef.current
    if (!drag || drag.id !== event.pointerId || !viewport) return
    viewport.scrollLeft -= event.clientX - drag.x
    viewport.scrollTop -= event.clientY - drag.y
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        'relative h-full cursor-grab touch-none overflow-auto bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.94),rgba(249,250,251,0.86)),linear-gradient(to_right,rgba(17,24,39,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.05)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px] active:cursor-grabbing',
        className
      )}
    >
      <div className="sticky bottom-4 left-4 z-20 flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-sm">
        <div className="flex items-center gap-2 px-2 text-xs font-medium text-gray-500">
          <Move className="h-4 w-4" />
          Drag to move
        </div>
        <button type="button" onClick={() => zoomBy(-0.1)} className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => zoomBy(0.1)} className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <div
        className={cn('origin-top-left p-6 transition-transform duration-150', contentClassName)}
        style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%`, minHeight: `${100 / zoom}%` }}
      >
        {children}
      </div>
    </div>
  )
}

export function JourneyPanelCloseButton({
  onClose,
  label,
}: {
  onClose: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
      aria-label={label}
    >
      <X className="h-4 w-4" />
    </button>
  )
}
