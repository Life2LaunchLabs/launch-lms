'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'

import { PREVIEW_COOKIE } from './previewSwitch'

/** Keeps a `?new=` choice for the rest of the visit. */
export function RememberPreviewChoice() {
  const value = useSearchParams().get('new')
  useEffect(() => {
    if (value === '1' || value === '0') document.cookie = `${PREVIEW_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`
  }, [value])
  return null
}

/** On the current portfolio: a way into the new one, on the same page. */
export function TryNewPortfolio() {
  return <div className="mx-auto mt-4 flex max-w-5xl items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3 sm:mx-8 lg:mx-auto">
    <Sparkles className="h-5 w-5 shrink-0 text-[var(--org-primary-color)]" />
    <p className="min-w-0 flex-1 text-sm"><b className="font-extrabold">Try the new portfolio.</b> <span className="text-muted-foreground">Same stuff, new look. You can switch back any time.</span></p>
    <Link href="?new=1" className="shrink-0 text-sm font-extrabold text-[var(--org-primary-color)] hover:underline">Try it</Link>
  </div>
}
