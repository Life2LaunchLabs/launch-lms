'use client'

import React from 'react'
import { ArrowRight, CalendarDays, Check, MessageSquareText } from 'lucide-react'

export interface Made { assignment_uuid: string; name: string; group: boolean }

function Next({ icon, title, sub, onClick, first }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void; first?: boolean }) {
  return <button type="button" onClick={onClick} className={first
    ? 'flex w-full items-center gap-3.5 rounded-2xl bg-primary p-4 text-left text-primary-foreground hover:brightness-110'
    : 'flex w-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left hover:border-foreground'}>
    <span className={first ? 'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-foreground/15' : 'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted'}>{icon}</span>
    <span className="flex min-w-0 flex-col"><b className="text-[15px]">{title}</b><span className={first ? 'text-[13px] opacity-75' : 'text-[13px] text-muted-foreground'}>{sub}</span></span>
  </button>
}

/** After assigning: what was made, and where to go next. */
export default function DonePanel({ made, scheduled, onOpen, onClose }: { made: Made[]; scheduled: boolean; onOpen: (uuid: string, query?: string) => void; onClose: () => void }) { // eslint-disable-line no-unused-vars
  const first = made[0]
  return <div className="mx-auto w-full max-w-[520px] px-6 py-12">
    <div className="flex items-center gap-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-good-soft text-good"><Check size={22} strokeWidth={3} aria-hidden="true" /></span>
      <span className="flex min-w-0 flex-col"><b className="text-xl">{made.length === 1 ? 'Assignment created' : `${made.length} assignments created`}</b>
        <span className="truncate text-sm text-muted-foreground">{made.map((item) => item.name).join(', ')}</span></span>
    </div>
    <div className="mt-6 flex flex-col gap-2.5">
      <Next first icon={<ArrowRight size={18} />} title={`Open ${first.name}`} sub="Follow progress and review work" onClick={() => onOpen(first.assignment_uuid)} />
      {first.group ? <Next icon={<MessageSquareText size={18} />} title="Message the group" sub="Everyone on it is already in its messages" onClick={() => onOpen(first.assignment_uuid, '?messages=group')} /> : null}
      {scheduled ? <Next icon={<CalendarDays size={18} />} title="Fine-tune the schedule" sub="Plan which day you’ll do each step" onClick={() => onOpen(first.assignment_uuid, '?schedule=1')} /> : null}
      <button type="button" onClick={onClose} className="mt-1 self-center text-sm font-semibold text-muted-foreground hover:text-foreground">Done</button>
    </div>
  </div>
}
