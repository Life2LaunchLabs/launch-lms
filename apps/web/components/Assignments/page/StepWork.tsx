'use client'

import React from 'react'
import useSWR from 'swr'
import { BriefcaseBusiness, ChevronRight, FileText, Link2, ListChecks, MessageSquareQuote } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@components/ui/dialog'
import ReviewEvidence, { handedInText } from '@components/Goals/admin/live/ReviewEvidence'
import { PersonTile } from '@components/Assignments/Pair'
import { assignmentStepWorkKey, goalAdminApi, type ReviewItem } from '@services/goals/admin'
import type { AssignmentPerson } from '@services/assignments/assignments'
import type { StepStatus } from '@services/goals/types'
import { personLabel, plural } from '@services/assignments/status'

/** The learner as staff see them on an answer: the name they go by when the API sends it (DEV-136), else the roster's. */
const answerName = (item: ReviewItem, people: Record<string, AssignmentPerson>) => item.user?.name || personLabel(item.user ? people[String(item.user.id)] || (item.user as AssignmentPerson) : null)

const STATUS: Partial<Record<StepStatus, string>> = { completed: 'Complete', submitted: 'Handed in', changes_requested: 'Sent back', in_progress: 'Started', excused: 'Excused' }

/** A line of what the learner put on the step: their words first, else what they handed in. */
export function workSummary(item: ReviewItem): { icon: typeof FileText; text: string } | null {
  const text = handedInText(item)
  if (text) return { icon: MessageSquareQuote, text: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
  if (item.result?.kind === 'choice' && item.result.choices.length) return { icon: ListChecks, text: item.result.choices.join(', ') }
  const files = item.entries.filter((entry) => entry.kind === 'file')
  if (files.length) return { icon: FileText, text: files.length === 1 ? (files[0].title || files[0].filename || '1 file') : plural(files.length, 'file') }
  const links = item.entries.filter((entry) => entry.kind === 'link')
  if (links.length) return { icon: Link2, text: links.length === 1 ? (links[0].title || links[0].url) : plural(links.length, 'link') }
  const listed = item.entries.filter((entry) => entry.kind === 'item')
  if (listed.length) return { icon: ListChecks, text: listed.map((entry) => entry.title || entry.url).join(', ') }
  const counted = item.portfolio?.items || []
  if (counted.length) return { icon: BriefcaseBusiness, text: counted.map((entry) => entry.title).join(', ') }
  if (item.learner_note) return { icon: MessageSquareQuote, text: item.learner_note }
  return null
}

/**
 * Each learner's answer on one step, whatever its status: what they wrote, handed in or chose.
 * Opening one shows it in full, the way a reviewer sees it (FEED-215).
 */
export default function StepWork({ orgId, assignmentUuid, stepKey, token, people }: { orgId: number; assignmentUuid: string; stepKey: string; token?: string; people: Record<string, AssignmentPerson> }) {
  const { data, error, isLoading } = useSWR(orgId && token ? assignmentStepWorkKey(assignmentUuid, stepKey, orgId) : null, () => goalAdminApi.stepWork(orgId, assignmentUuid, stepKey, token))
  const [open, setOpen] = React.useState<ReviewItem | null>(null)
  const items = data?.items || []
  if (error) return <p className="text-[13px] text-muted-foreground">Answers couldn’t load. Refresh to try again.</p>
  if (isLoading) return <p className="text-[13px] text-muted-foreground">Loading answers…</p>
  if (!items.length) return <p className="text-[13px] text-muted-foreground">No answers yet.</p>
  return <section aria-label="Answers" className="flex flex-col gap-1.5">
    <b className="text-xs font-semibold text-muted-foreground">Answers · {items.length}</b>
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => {
        const person = item.user ? people[String(item.user.id)] || (item.user as AssignmentPerson) : null
        const summary = workSummary(item)
        const Icon = summary?.icon || FileText
        return <li key={item.step_uuid}>
          <button type="button" onClick={() => setOpen(item)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-left hover:bg-muted">
            <PersonTile person={person} name={answerName(item, people)} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]"><b className="font-semibold">{answerName(item, people)}</b><span className="text-xs text-muted-foreground">{STATUS[item.status] || ''}</span></span>
              {summary ? <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Icon size={13} aria-hidden="true" className="shrink-0" /><span className="line-clamp-2 sm:line-clamp-1">{summary.text}</span></span> : null}
            </span>
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          </button>
        </li>
      })}
    </ul>
    <Dialog open={!!open} onOpenChange={(next) => { if (!next) setOpen(null) }}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="border-b border-border px-4 py-3 pr-12 text-base">{open ? `${answerName(open, people)}’s answer` : 'Answer'}</DialogTitle>
        {open ? <div className="min-h-0 flex-1 overflow-auto bg-gray-100 text-gray-900">
          <ReviewEvidence item={open} confirmOnly={false} />
          {open.learner_note && (open.answer || open.entries.length || open.submission?.text) ? <p className="mx-4 mb-4 rounded-xl bg-white p-4 text-sm"><b className="block text-xs text-gray-500">Their note</b>{open.learner_note}</p> : null}
        </div> : null}
      </DialogContent>
    </Dialog>
  </section>
}
