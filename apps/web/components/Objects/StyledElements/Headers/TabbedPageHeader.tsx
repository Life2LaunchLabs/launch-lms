'use client'

import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import React, { useEffect, useRef, useState } from 'react'

export type TabbedPageHeaderTab<T extends string = string> = {
  id: T
  label: string
  href: string
}

type TabbedPageHeaderProps<T extends string> = {
  activeTab: T
  tabs: Array<TabbedPageHeaderTab<T>>
  expanded: boolean
  fullHeader: React.ReactNode
  compactHeader: React.ReactNode
  onTabChange?: React.Dispatch<TabbedPageHeaderTab<T>>
  betweenHeaderAndTabs?: React.ReactNode
  ariaLabel?: string
  layoutId?: string
}

export default function TabbedPageHeader<T extends string>({
  activeTab,
  tabs,
  expanded,
  fullHeader,
  compactHeader,
  onTabChange,
  betweenHeaderAndTabs,
  ariaLabel = 'Page views',
  layoutId = 'tabbed-page-active-tab',
}: TabbedPageHeaderProps<T>) {
  const reduceMotion = useReducedMotion()
  const headerRef = useRef<HTMLElement | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [stickyBounds, setStickyBounds] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      if (!expanded) {
        setScrolled(false)
        return
      }
      const bounds = headerRef.current?.getBoundingClientRect()
      setScrolled((bounds?.bottom || 1) <= 0)
      if (bounds) setStickyBounds({ left: bounds.left, width: bounds.width })
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [expanded])

  const nav = (compact = false) => (
    <nav className="flex gap-7 overflow-x-auto" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const selected = activeTab === tab.id
        const className = `relative shrink-0 ${compact ? 'py-2.5' : 'py-3'} text-sm font-semibold transition-colors ${selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`
        const indicator = selected ? (compact
          ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
          : <motion.span
              layoutId={layoutId}
              className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
        ) : null

        return onTabChange ? (
          <button type="button" key={tab.id} onClick={() => onTabChange(tab)} className={className}>
            {tab.label}{indicator}
          </button>
        ) : (
          <Link key={tab.id} href={tab.href} className={className} aria-current={selected ? 'page' : undefined}>
            {tab.label}{indicator}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      <motion.header
        ref={headerRef}
        className={`${expanded ? 'relative' : 'sticky top-0'} z-[var(--z-sticky-header)] border-b border-border/70 bg-background/95 backdrop-blur-xl ${expanded ? '' : 'shadow-[0_1px_0_hsl(var(--border)/.25)]'}`}
      >
        <motion.div layout className={expanded ? 'py-8 sm:py-12' : 'py-3'}>
          {expanded ? fullHeader : compactHeader}
        </motion.div>
        {betweenHeaderAndTabs}
        {tabs.length > 1 ? nav(false) : null}
      </motion.header>

      <AnimatePresence>
        {expanded && scrolled && stickyBounds ? (
          <motion.header
            initial={reduceMotion ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
            style={{ left: stickyBounds.left, width: stickyBounds.width }}
            className="fixed top-0 z-[var(--z-sticky-header)] isolate border-b border-border/70 bg-background/95 backdrop-blur-xl before:absolute before:-inset-x-8 before:inset-y-0 before:-z-10 before:bg-background/95"
          >
            <div className="py-2.5">{compactHeader}</div>
            {tabs.length > 1 ? nav(true) : null}
          </motion.header>
        ) : null}
      </AnimatePresence>
    </>
  )
}
