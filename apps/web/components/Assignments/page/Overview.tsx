'use client'

import React from 'react'
import { Check, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import StatusBar, { StatusLegend } from '@components/Assignments/StatusBar'
import type { AssignmentDetail } from '@services/assignments/assignments'
import { plural, shortDate, totalOf } from '@services/assignments/status'

/**
 * One bar split by stage, each stage as wide as its steps, showing where learners are on it. The
 * stage that's running says Now and carries the now line; finished stages get a check.
 */
export default function Overview({ detail }: { detail: AssignmentDetail }) {
  const ended = detail.status === 'ended'
  if (!detail.learner_count) return <section className="rounded-[18px] border border-border bg-card p-[18px]">
    <h2 className="text-[17px] font-bold">Overview</h2>
    <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 p-3.5">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-card"><Mail size={18} aria-hidden="true" /></span>
      <span className="text-sm"><b className="block">Waiting for {detail.target.name} to join</b>
        <span className="text-muted-foreground">Invite sent {shortDate(detail.creation_date)}. Their steps open when they accept.</span></span>
    </div>
  </section>
  const unit = detail.learner_count > 1 ? 'steps across the group' : 'steps'
  const current = ended ? -1 : detail.stage?.position ?? -1
  const single = detail.stages.length === 1
  return <section aria-labelledby="overview" className="rounded-[18px] border border-border bg-card px-[18px] pb-[18px] pt-4">
    <div className="flex items-baseline justify-between gap-2.5">
      <h2 id="overview" className="text-[17px] font-bold">Overview</h2>
      <span className="text-[13.5px] text-muted-foreground">{detail.scheduled ? detail.due_date ? `Ends ${shortDate(detail.due_date)}` : '' : 'Self-paced'}</span>
    </div>
    <div className="mt-4 flex flex-wrap gap-x-1.5 gap-y-4">
      {detail.stages.map((stage) => {
        const total = totalOf(stage.counts)
        const done = total > 0 && stage.counts.done + stage.counts.review === total
        return <div key={stage.key} className="min-w-[140px]" style={{ flex: `${Math.max(stage.steps.length, 1)} 1 0` }}>
          <div className="flex items-center gap-1.5 text-[13.5px] font-bold">
            <span className="truncate">{single ? 'All steps' : stage.title}</span>
            {stage.position === current ? <em className="rounded-full bg-brand px-2 py-px text-[10.5px] font-extrabold not-italic tracking-wide text-white">Now</em>
              : !ended && done ? <Check size={14} className="text-good" aria-label="Done" /> : null}
          </div>
          <span className="mb-2 block text-xs text-muted-foreground">{detail.scheduled && stage.start_date ? `Starts ${shortDate(stage.start_date)}` : plural(stage.steps.length, 'step')}</span>
          <StatusBar counts={stage.counts} unit={unit} size="lg" now={stage.position === current} label={stage.title} />
        </div>
      })}
    </div>
    <StatusLegend className={cn('mt-4')} />
  </section>
}
