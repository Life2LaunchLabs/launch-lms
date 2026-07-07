'use client'

import { getUriWithOrg } from '@services/config/config'
import { ArrowLeft, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'

function ContentPageHeader({
  backIcon = 'arrow',
  backLabel = 'Back',
  orgslug,
  tabs,
  title,
  progressLabel,
  progressValue,
  onBack,
  showBack = true,
  noBottomMargin = false,
  noHorizontalBleed = false,
}: {
  backIcon?: 'arrow' | 'x'
  backLabel?: string
  orgslug: string
  tabs?: Array<{
    href: string
    label: string
    active?: boolean
  }>
  title?: React.ReactNode
  progressLabel?: string
  progressValue?: number
  onBack?: () => void
  showBack?: boolean
  noBottomMargin?: boolean
  noHorizontalBleed?: boolean
}) {
  const router = useRouter()
  const BackIcon = backIcon === 'x' ? X : ArrowLeft
  const hasProgress = typeof progressValue === 'number'
  const normalizedProgress = Math.max(0, Math.min(100, progressValue || 0))
  const showBackText = backIcon === 'arrow'
  const hasTabs = Boolean(tabs?.length)

  return (
    <div
      className={`sticky top-0 border-b border-border/80 px-6 ${noHorizontalBleed ? '' : '-mx-6'} ${noBottomMargin ? '' : 'mb-10'}`}
      style={{
        backgroundColor: 'var(--org-page-background, #ffffff)',
        zIndex: 'var(--z-nav)',
      }}
    >
      <div className={`relative flex min-h-14 items-center ${hasTabs ? 'justify-center' : ''}`}>
        {!hasTabs && showBack && (
          <button
            type="button"
            onClick={onBack || (() => router.back())}
            className="inline-flex h-10 min-w-0 items-center gap-2 pr-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            aria-label={backLabel}
          >
            <BackIcon size={18} strokeWidth={2.4} />
            {showBackText && <span>{backLabel}</span>}
          </button>
        )}
        {hasTabs ? (
          <nav
            className="grid h-14 w-full max-w-md"
            style={{ gridTemplateColumns: `repeat(${tabs?.length || 1}, minmax(0, 1fr))` }}
            aria-label="Page views"
          >
            {tabs?.map((tab) => (
              <Link
                key={tab.href}
                href={getUriWithOrg(orgslug, tab.href)}
                className={`relative flex items-center justify-center text-sm font-bold uppercase tracking-[0.14em] transition-colors ${
                  tab.active ? 'text-sky-500' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {tab.active && (
                  <span className="absolute -bottom-px left-0 right-0 h-1 rounded-t-full bg-sky-400" />
                )}
              </Link>
            ))}
          </nav>
        ) : null}
        {!hasTabs && hasProgress ? (
          <div className="pointer-events-none absolute left-1/2 w-[52%] max-w-sm -translate-x-1/2 sm:w-[64%]">
            {progressLabel && (
              <div className="mb-1 text-center text-[11px] font-semibold text-muted-foreground">
                {progressLabel}
              </div>
            )}
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gray-800 transition-all"
                style={{ width: `${normalizedProgress}%` }}
              />
            </div>
          </div>
        ) : !hasTabs && title ? (
          <h1 className="pointer-events-none absolute left-1/2 max-w-[52%] -translate-x-1/2 truncate text-center text-sm font-semibold text-muted-foreground sm:max-w-[64%]">
            {title}
          </h1>
        ) : null}
      </div>
    </div>
  )
}

export default ContentPageHeader
