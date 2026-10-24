'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight, CircleHelp, ClipboardCheck, Clock, Hand, Layers, Lock, MessageSquareText, Users } from 'lucide-react'
import { TargetTile } from '@components/Assignments/Pair'
import type { AssignmentDetail, AssignmentThread } from '@services/assignments/assignments'
import { needLines } from '@services/assignments/page'
import { needTotal } from '@services/assignments/status'

const ICONS = { questions: CircleHelp, review: ClipboardCheck, behind: Clock } as const

function Card({ icon, title, extra, className = 'border-border bg-card', children }: { icon: React.ReactNode; title: string; extra?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`rounded-[18px] border p-[18px] ${className}`}>
    <h3 className="flex items-center gap-2 text-[15px] font-bold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span>{title}{extra}</h3>
    {children}
  </section>
}

const time = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Beside the steps: what needs the viewer by kind (each opens People, filtered), the group's
 * messages, and the plan's other running assignments.
 */
export default function Sidebar({ detail, thread, needsHref, otherHref, onMessage }: {
  detail: AssignmentDetail
  thread?: AssignmentThread | null
  needsHref: (kind: 'questions' | 'review' | 'behind') => string // eslint-disable-line no-unused-vars
  otherHref: (uuid: string) => string // eslint-disable-line no-unused-vars
  onMessage: () => void
}) {
  const total = needTotal(detail.needs)
  const others = detail.others.filter((other) => other.status !== 'ended')
  const last = thread?.last_message
  return <aside className="flex flex-col gap-4">
    {detail.status !== 'ended' ? <Card icon={<Hand />} title="Needs you" className="border-transparent bg-brand-soft"
      extra={total ? <span className="ml-auto rounded-full bg-brand px-2 py-px text-xs font-bold text-white">{total}</span> : null}>
      {total ? <div className="mt-1.5">{needLines(detail.needs).map(({ key, count, label }) => {
        const Icon = ICONS[key]
        return <Link key={key} href={needsHref(key)} className="mt-1 flex items-center gap-2.5 rounded-[10px] px-1.5 py-2 text-[13.5px] hover:bg-card/70">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-card"><Icon size={16} aria-hidden="true" /></span>
          <b className="min-w-[22px] text-xl font-extrabold tabular-nums">{count}</b><span className="flex-1">{label}</span>
          <ChevronRight size={16} className="text-muted-foreground" aria-hidden="true" />
        </Link>
      })}</div> : <p className="mt-2 text-[13.5px] text-muted-foreground">Nothing right now.</p>}
    </Card> : null}
    {detail.target.type === 'group' ? <Card icon={<MessageSquareText />} title="Messages">
      <button type="button" onClick={onMessage} className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-1.5 py-2.5 text-left hover:bg-muted">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white"><Users size={18} aria-hidden="true" /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm">{detail.target.name}</b><em className="text-xs font-semibold not-italic text-good">{time(last?.creation_date)}</em></span>
          <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="flex min-w-0 flex-1 items-center gap-1 truncate">{last ? <>{last.staff_only ? <Lock size={12} className="shrink-0" aria-label="Staff only" /> : null}<span className="truncate">{last.mine ? 'You' : (last.sender?.name || '').split(' ')[0]}: {last.preview || last.body}</span></> : 'Everyone on the assignment'}</span>
            {thread?.unread ? <i className="grid h-5 min-w-5 place-items-center rounded-full bg-good px-1.5 text-[11px] font-bold not-italic text-white">{thread.unread}</i> : null}
          </span>
        </span>
      </button>
      <p className="mt-2 flex gap-2 text-[13px] leading-snug text-muted-foreground"><Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Mark a message <b className="text-foreground">Staff only</b> to keep it from learners. Works here and in any learner’s messages.</span></p>
    </Card> : null}
    {others.length ? <Card icon={<Layers />} title={`Also on ${detail.plan.title}`}>
      <div className="mt-1.5 divide-y divide-border">{others.map((other) => <Link key={other.assignment_uuid} href={otherHref(other.assignment_uuid)} className="flex items-center gap-2.5 py-2 hover:opacity-80">
        <TargetTile target={other.target} size="sm" />
        <span className="min-w-0"><b className="block truncate text-[13.5px]">{other.target.name}</b><span className="text-xs text-muted-foreground">{other.target.type === 'group' ? 'Group' : 'One learner'}</span></span>
      </Link>)}</div>
    </Card> : null}
  </aside>
}
