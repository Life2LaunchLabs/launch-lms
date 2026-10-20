'use client'
import React from 'react'
import Link from 'next/link'
import { LockSimple } from '@phosphor-icons/react'
import RequestAccessButton, { accessRequestLabel } from '@components/Admin/RequestAccessButton'
import type { AccessRequest } from '@/lib/admin/registry'
import { cn } from '@/lib/utils'

/** One Home widget: a titled card with an optional count and a link to the full view. */
export function WidgetCard({ title, count, more, children, className }: { title: string; count?: number; more?: { href: string; label?: string }; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-gray-900">
          <span className="truncate">{title}</span>
          {count ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">{count}</span> : null}
        </h2>
        {more ? <Link href={more.href} className="-my-3 inline-flex min-h-10 shrink-0 items-center text-xs font-semibold text-gray-500 hover:text-gray-900 md:my-0 md:min-h-0">{more.label || 'See all'}</Link> : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}

/** A row in a widget: optional leading visual, a title and detail line, and something on the right. */
export function WidgetRow({ href, lead, title, detail, trailing }: { href?: string; lead?: React.ReactNode; title: React.ReactNode; detail?: React.ReactNode; trailing?: React.ReactNode }) {
  const body = <>
    {lead}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
      {detail ? <p className="truncate text-xs text-gray-500">{detail}</p> : null}
    </div>
    {trailing ? <div className="flex shrink-0 items-center gap-2 text-xs font-semibold">{trailing}</div> : null}
  </>
  const classes = 'flex items-center gap-3 px-5 py-3'
  return <li>{href ? <Link href={href} className={cn(classes, 'transition hover:bg-gray-50')}>{body}</Link> : <div className={classes}>{body}</div>}</li>
}

export function WidgetList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-gray-100">{children}</ul>
}

export function WidgetEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-center text-sm text-gray-500">{children}</p>
}

export function Chip({ tone = 'gray', children }: { tone?: 'gray' | 'blue' | 'amber' | 'green' | 'red'; children: React.ReactNode }) {
  const tones = { gray: 'bg-gray-100 text-gray-600', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700' }
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1', tones[tone])}>{children}</span>
}

/** A widget the org's plan or packages don't include, with the request that unlocks it. */
export function LockedWidget({ title, description, request }: { title: string; description: string; request: AccessRequest }) {
  return (
    <WidgetCard title={title}>
      <div className="flex items-center gap-4 px-5 py-5">
        <LockSimple size={22} weight="fill" className="shrink-0 text-gray-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-700">Part of {accessRequestLabel(request)}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <RequestAccessButton request={request} className="px-3 py-1.5 text-xs" />
      </div>
    </WidgetCard>
  )
}

/** "Today", "Tomorrow", a weekday this week, else a short date, for a YYYY-MM-DD day. */
export function dayLabel(day: string, now = new Date()) {
  const date = new Date(`${day.slice(0, 10)}T00:00:00`)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 7) return date.toLocaleDateString([], { weekday: 'long' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
