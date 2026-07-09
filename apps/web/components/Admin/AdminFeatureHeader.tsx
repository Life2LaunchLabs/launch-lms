'use client'

import Link from 'next/link'
import React from 'react'

export type AdminFeatureTab = {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  href?: string
  onClick?: () => void
}

export default function AdminFeatureHeader({
  feature,
  tabs,
  activeTab,
  actions,
  tone = 'default',
}: {
  feature: string
  tabs: AdminFeatureTab[]
  activeTab: string
  actions?: React.ReactNode
  tone?: 'default' | 'platform'
}) {
  const isPlatform = tone === 'platform'

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

        <div className="flex min-w-0 items-center gap-3">
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label={`${feature} pages`}>
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
          </nav>
          {actions}
        </div>
      </div>
    </header>
  )
}
