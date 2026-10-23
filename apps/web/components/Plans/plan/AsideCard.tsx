import React from 'react'
import { cn } from '@/lib/utils'

/** A card in the plan page's sidebar: an icon tile and title, an optional tag on the right, then its body. */
export function AsideCard({ icon, title, tag, children }: { icon: React.ReactNode; title: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-[18px] border border-border bg-card p-[18px] motion-safe:animate-[plan-rise_.35s_both]">
    <h3 className="flex items-center gap-2 text-[15px] font-bold">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted" aria-hidden="true">{icon}</span>{title}
      {tag ? <span className="ml-auto">{tag}</span> : null}
    </h3>
    {children}
  </section>
}

/** A small rounded label: muted, or green for something live. */
export function Tag({ tone = 'muted', children }: { tone?: 'muted' | 'live'; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-2 py-[3px] text-[11.5px] font-bold',
    tone === 'live' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{children}</span>
}
