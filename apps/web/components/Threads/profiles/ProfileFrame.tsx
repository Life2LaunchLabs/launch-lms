'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHub } from '@components/Hub/HubContext'
import { threadHref } from '@components/Admin/People/PeopleList'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { ProfileOf, ThreadTarget } from '../ThreadView'

const people = routePaths.org.admin.people

/** Where a profile lives under Threads. */
export function profileHref(orgslug: string, who: ProfileOf) {
  return getUriWithOrg(orgslug, 'username' in who ? people.user(who.username) : 'groupId' in who ? people.group(who.groupId) : people.org())
}

/** Opens a thread beside the page when the admin layout has the panel, else on the Threads page. */
export function useOpenThread(orgslug: string) {
  const hub = useHub()
  const router = useRouter()
  return React.useCallback((target: ThreadTarget) => {
    if (hub?.hasThreads) hub.openThreads(target)
    else router.push(threadHref(orgslug, target))
  }, [hub, router, orgslug])
}

export interface ProfileTab { key: string; label: string; href: string }

/**
 * A profile under Threads: who (art, name, a line and chips), its buttons, and its tabs. On the
 * page it sits under "Threads / name"; in the side panel it's compact and its tabs switch in place.
 */
export function ProfileFrame({ orgslug, art, title, sub, chips, actions, tabs, tab, onTab, compact, children }: {
  orgslug: string
  art: React.ReactNode
  title: string
  sub?: React.ReactNode
  chips?: React.ReactNode
  actions?: React.ReactNode
  tabs: ProfileTab[]
  tab: string
  /** In the panel, tabs switch here instead of navigating. */
  onTab?: (key: string) => void // eslint-disable-line no-unused-vars
  compact?: boolean
  children: React.ReactNode
}) {
  return <div className="@container scrollbar-subtle min-h-0 flex-1 overflow-y-auto">
    <div className={cn('mx-auto w-full', compact ? 'px-4 pb-8' : 'max-w-[62rem] px-4 pb-12 pt-5 md:px-8')}>
      {compact ? null : <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-2 text-sm">
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.threads.root())} className="font-semibold text-muted-foreground hover:text-foreground">Threads</Link>
        <span aria-hidden="true" className="text-muted-foreground">/</span>
        <span className="truncate font-semibold">{title}</span>
      </nav>}
      <header className={cn('flex flex-wrap items-start gap-x-4 gap-y-3', compact && 'pt-2')}>
        <div className="shrink-0">{art}</div>
        <div className="min-w-[12rem] flex-1">
          <h1 className={cn('font-black tracking-tight', compact ? 'text-xl' : 'text-2xl @2xl:text-[2rem] @2xl:leading-tight')}>{title}</h1>
          {sub ? <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p> : null}
          {chips ? <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <nav aria-label={`${title}`} className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((item) => {
          const current = item.key === tab
          const className = cn('-mb-px inline-flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold', current ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')
          return onTab ? <button key={item.key} type="button" onClick={() => onTab(item.key)} aria-current={current ? 'page' : undefined} className={className}>{item.label}</button>
            : <Link key={item.key} href={item.href} aria-current={current ? 'page' : undefined} className={className}>{item.label}</Link>
        })}
      </nav>
      <div className="mt-5 space-y-5">{children}</div>
    </div>
  </div>
}

/** The button that opens whoever's thread this profile is. */
export function ThreadButton({ onClick, label = 'Thread', primary }: { onClick: () => void; label?: string; primary?: boolean }) {
  return <button type="button" onClick={onClick}
    className={cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold', primary ? 'bg-foreground text-background hover:opacity-90' : 'border border-border hover:bg-muted')}>
    <MessageSquareText size={16} />{label}
  </button>
}

/** A card on a profile: a title, maybe a link or button beside it, and its body. */
export function Card({ title, aside, children, className }: { title?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-border bg-card p-5', className)}>
    {title || aside ? <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-bold">{title}</h2>{aside}</div> : null}
    {children}
  </section>
}
