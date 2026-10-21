'use client'

import Link from 'next/link'
import React from 'react'

export type AdminFeatureTab = {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  href?: string
  onClick?: () => void
  /** A number on the tab (e.g. requests waiting); nothing shows when it is 0 or left out. */
  count?: number | null
  /** What the count means, read by screen readers and shown on hover ("2 requests waiting"). */
  countLabel?: string
}

/**
 * An admin page's header: the feature name and its pages as tabs.
 * `pills` (the default) puts black pill tabs beside the name; `underline` stacks the name above
 * a row of underlined tabs, with `actions` at the end of that row (Plans uses it).
 */
export default function AdminFeatureHeader({
  feature,
  tabs,
  activeTab,
  actions,
  tone = 'default',
  variant = 'pills',
}: {
  feature: string
  tabs: AdminFeatureTab[]
  activeTab: string
  actions?: React.ReactNode
  tone?: 'default' | 'platform'
  variant?: 'pills' | 'underline'
}) {
  const isPlatform = tone === 'platform'
  const navRef = React.useRef<HTMLElement>(null)
  // On a phone the underlined tabs scroll sideways; keep the current one in view.
  React.useEffect(() => {
    if (variant !== 'underline') return
    const nav = navRef.current
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"]')
    if (nav && current) nav.scrollLeft = Math.max(0, current.offsetLeft - nav.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2)
  }, [variant, activeTab, tabs.length])

  if (variant === 'underline') {
    return (
      <header className="relative z-10 flex-shrink-0 bg-white text-black nice-shadow">
        <div className="px-4 pt-4 sm:px-8">
          <div className="text-sm font-black uppercase tracking-[0.16em]">{feature}</div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <nav ref={navRef} className="-mb-px flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={`${feature} pages`}>
              {tabs.map((tab) => {
                const isActive = tab.id === activeTab
                const className = `inline-flex min-h-[46px] shrink-0 items-center gap-2 whitespace-nowrap border-b-[2.5px] px-2.5 text-sm transition-colors sm:px-3 ${
                  isActive ? 'border-black font-semibold text-black' : 'border-transparent font-medium text-gray-500 hover:text-black'
                }`
                const content = (
                  <>
                    {tab.icon ? <span className="hidden sm:inline-flex" aria-hidden="true">{tab.icon}</span> : null}
                    <span>{tab.label}</span>
                    <TabCount count={tab.count} label={tab.countLabel} />
                  </>
                )
                return tab.href ? (
                  <Link key={tab.id} href={tab.href} className={className} aria-current={isActive ? 'page' : undefined}>
                    {content}
                  </Link>
                ) : (
                  <button key={tab.id} type="button" onClick={tab.onClick} className={className} aria-pressed={isActive}>
                    {content}
                  </button>
                )
              })}
            </nav>
            {actions ? <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div> : null}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header
      className={`relative z-10 flex-shrink-0 nice-shadow ${
        isPlatform ? 'bg-amber-400 text-black' : 'bg-white text-black'
      }`}
    >
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-8 py-2">
        <div className="text-sm font-black uppercase tracking-[0.16em]">
          {feature}
        </div>

        {(tabs.length > 1 || actions) && <div className="flex min-w-0 items-center gap-3">
          {tabs.length > 1 && <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label={`${feature} pages`}>
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab
              const className = `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive
                  ? 'bg-black text-white'
                  : isPlatform
                    ? 'text-black/65 hover:bg-black/10 hover:text-black'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-black'
              }`
              const content = (
                <>
                  {tab.icon}
                  <span>{tab.label}</span>
                  <TabCount count={tab.count} label={tab.countLabel} />
                </>
              )

              return tab.href ? (
                <Link key={tab.id} href={tab.href} className={className}>
                  {content}
                </Link>
              ) : (
                <button key={tab.id} type="button" onClick={tab.onClick} className={className}>
                  {content}
                </button>
              )
            })}
          </nav>}
          {actions}
        </div>}
      </div>
    </header>
  )
}

function TabCount({ count, label }: { count?: number | null; label?: string }) {
  if (!count) return null
  return (
    <span title={label} className="relative inline-grid h-[19px] min-w-[19px] place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white tabular-nums">
      <span aria-hidden={label ? true : undefined}>{count > 99 ? '99+' : count}</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  )
}
