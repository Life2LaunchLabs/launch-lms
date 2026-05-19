'use client'

import { MouseEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from 'react'
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
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })

  const zoomBy = (delta: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const originX = rect ? rect.width / 2 : 0
    const originY = rect ? rect.height / 2 : 0
    setView((current) => {
      const nextScale = Math.min(maxZoom, Math.max(minZoom, Number((current.scale + delta).toFixed(2))))
      const ratio = nextScale / current.scale
      return {
        scale: nextScale,
        x: originX - (originX - current.x) * ratio,
        y: originY - (originY - current.y) * ratio,
      }
    })
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const originX = event.clientX - rect.left
      const originY = event.clientY - rect.top
      setView((current) => {
        const nextScale = Math.min(maxZoom, Math.max(minZoom, Number((current.scale - event.deltaY * 0.001).toFixed(2))))
        const ratio = nextScale / current.scale
        return {
          scale: nextScale,
          x: originX - (originX - current.x) * ratio,
          y: originY - (originY - current.y) * ratio,
        }
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [maxZoom, minZoom])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('a, input, textarea, select, [data-canvas-interactive="true"]')) return
    suppressClickRef.current = false
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    const moved = drag.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2
    if (moved) {
      event.preventDefault()
      suppressClickRef.current = true
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    }
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null
  }

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={handleClickCapture}
      className={cn(
        'relative h-full cursor-grab touch-none select-none overflow-hidden bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.94),rgba(249,250,251,0.86)),linear-gradient(to_right,rgba(17,24,39,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.05)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px] active:cursor-grabbing',
        className
      )}
    >
      <div data-canvas-interactive="true" className="absolute bottom-4 left-4 z-20 flex w-fit select-none items-center gap-2 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-sm">
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
        className={cn('absolute left-0 top-0 origin-top-left p-6', contentClassName)}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
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
