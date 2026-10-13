'use client'

import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@components/ui/button'

// A sheet over the Hub surface: full width from the bottom on phones, centered
// at the composer's width on larger screens. Click-away and Escape close it.
export default function HubSheet({ label, title, onClose, children, footer }: {
  label: string
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus({ preventScroll: true })
    return () => previous?.focus?.({ preventScroll: true })
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      // Let open menus and dialogs inside the sheet consume Escape first.
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  // Stops above the phone navigation bar, matching the composer's offset.
  return (
    <div className="absolute inset-x-0 bottom-20 top-0 z-[var(--z-interactive)] flex flex-col justify-end lg:bottom-0">
      <button type="button" tabIndex={-1} aria-label={`Close ${label}`} onClick={onClose} className="absolute inset-0 bg-black/30 animate-in fade-in duration-150" />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative mx-auto flex max-h-[85%] w-full max-w-[50rem] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-border/70 bg-background shadow-2xl outline-none animate-in slide-in-from-bottom-4 duration-200 sm:mb-4 sm:max-h-[80%] sm:w-[calc(100%-2.5rem)] sm:rounded-2xl sm:border-b"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" aria-hidden="true" />
        <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-2 sm:pt-3">
          <div className="min-w-0 flex-1 text-sm font-semibold">{title}</div>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose} aria-label={`Close ${label}`}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-border/60 px-3 py-2">{footer}</footer> : null}
      </section>
    </div>
  )
}
