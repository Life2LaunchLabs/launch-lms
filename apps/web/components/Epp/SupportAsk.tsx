'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, ChevronRight, GraduationCap, Loader2, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import { routePaths } from '@services/routing/paths'
import { MY_SUPPORTS_KEY, supportApi, type MySupport } from '@services/school/support'
import { cn } from '@/lib/utils'

/** The schools supporting the signed-in learner, or asking to. Shared by Goals, the menu and their Education Plan. */
export function useMySupports() {
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const { data, mutate } = useSWR(token ? MY_SUPPORTS_KEY : null, () => supportApi.mine(token), { revalidateOnFocus: true })
  const supports = data?.supports || []
  return {
    token, loaded: Boolean(data), mutate, supports,
    /** Asks they can still answer: waiting, or they said not now. */
    open: supports.filter((item) => (item.status === 'requested' || item.status === 'declined') && item.request_uuid && item.org),
    active: supports.filter((item) => item.status === 'active' && item.org),
  }
}

const button = 'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold disabled:opacity-50'

/**
 * A school's ask to support the learner's Education Plan and Profile, answerable here as well as in their chat.
 * Not now keeps it open (FEED-219): the ask stays, says they said not now, and Yes, share still works.
 */
export function SupportAsk({ ask, token, onAnswered, className }: { ask: MySupport; token?: string; onAnswered: () => unknown; className?: string }) {
  const [busy, setBusy] = React.useState<'yes' | 'later' | ''>('')
  const later = ask.status === 'declined'
  const school = ask.org?.name || 'Your school'
  const answer = async (accept: boolean) => {
    setBusy(accept ? 'yes' : 'later')
    try {
      await supportApi.answer(ask.support_uuid!, accept, ask.request_uuid || undefined, token)
      toast.success(accept ? `${school} supports your plan now` : 'Okay. You can say yes any time from your Education Plan.')
      await onAnswered()
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t go through')
    } finally {
      setBusy('')
    }
  }
  return <section aria-label={`Request from ${school}`} className={cn('rounded-2xl border border-border bg-card p-4', className)}>
    <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><GraduationCap size={14} aria-hidden="true" />Request from your school</p>
    <h2 className="mt-1.5 text-base font-bold leading-snug">Share your plan with {school}?</h2>
    {ask.text ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{ask.text}</p> : null}
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {later ? <span className="mr-auto text-sm text-muted-foreground">You said not now. You can still say yes.</span> : null}
      <span className={cn('flex flex-wrap gap-2', !later && 'ml-auto')}>
        {later ? null : <button type="button" disabled={Boolean(busy)} onClick={() => void answer(false)} className={cn(button, 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          {busy === 'later' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} aria-hidden="true" />}Not now
        </button>}
        <button type="button" disabled={Boolean(busy)} onClick={() => void answer(true)} className={cn(button, 'bg-foreground text-background')}>
          {busy === 'yes' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} aria-hidden="true" />}Yes, share
        </button>
      </span>
    </div>
  </section>
}

/**
 * On Goals (the map, or the phase you're in): the way to the learner's Education Plan once a school supports them (where they enter classes),
 * and a school's ask while it waits. Shows nothing for a learner no school has asked.
 */
export function EducationPlanEntry({ orgslug, className }: { orgslug: string; className?: string }) {
  const { open, active, token, mutate } = useMySupports()
  const waiting = open.filter((item) => item.status === 'requested')
  if (!open.length && !active.length) return null
  // A fresh ask is answered right here; one they said not now to waits on their Education Plan, not on Goals.
  if (waiting.length) return <div className={cn('flex flex-col gap-3', className)}>{waiting.map((ask) => <SupportAsk key={ask.support_uuid} ask={ask} token={token} onAnswered={mutate} />)}</div>
  const school = active[0]?.org || open[0]?.org
  const href = getUriWithOrg(orgslug, routePaths.org.epp(school?.slug))
  return <Link href={href} className={cn('flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/60', className)}>
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true"><GraduationCap size={18} /></span>
    <span className="min-w-0 flex-1">
      <span className="block font-bold">My Education Plan</span>
      <span className="block text-sm text-muted-foreground">{active.length
        ? `Enter your classes and choose what ${active.length > 1 ? 'your schools see' : `${school?.name || 'your school'} sees`}.`
        : `${school?.name || 'Your school'} asked to support your plan. You can still say yes.`}</span>
    </span>
    <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>
}
