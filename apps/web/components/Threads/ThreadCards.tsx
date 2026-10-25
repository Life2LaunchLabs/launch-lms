'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { BellRing, Check, ClipboardCheck, Clock, Hand, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { reviewHref } from '@components/Goals/admin/live/ui'
import { routePaths } from '@services/config/config'
import { goalAdminApi } from '@services/goals/admin'
import { peopleApi } from '@services/school/people'
import { shortDate } from '@services/assignments/status'
import type { PersonSummary } from '@services/goals/types'
import type { AskedItem, PastDueItem, ReviewItem, ThreadRequest } from '@services/school/threads'

const button = 'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-60'
const primary = cn(button, 'bg-[var(--org-primary-color)] text-white hover:opacity-90')
const plain = cn(button, 'border border-border hover:bg-muted')

/** A card in a thread about something that waits on staff, beside the messages. */
function Notice({ icon: Icon, tone, children }: { icon: React.ElementType; tone?: 'warn' | 'bad' | 'good'; children: React.ReactNode }) {
  return <div className={cn('flex gap-3 rounded-2xl border px-3.5 py-3', tone === 'bad' ? 'border-red-200 dark:border-red-500/30' : 'border-border')}>
    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full',
      tone === 'bad' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' : tone === 'warn' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
        : tone === 'good' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
      <Icon size={15} aria-hidden="true" />
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-2 text-[13.5px] leading-snug">{children}</div>
  </div>
}

function Faces({ people, onPerson }: { people: PersonSummary[]; onPerson?: (person: PersonSummary) => void }) { // eslint-disable-line no-unused-vars
  return <span className="flex items-center">
    {people.slice(0, 6).map((person) => <button key={person.id} type="button" onClick={() => onPerson?.(person)} title={`${person.name}’s thread`} aria-label={`${person.name}’s thread`} className="-mr-1.5 rounded-full ring-2 ring-background">
      <PersonAvatar user={person as any} size="sm" />
    </button>)}
    {people.length > 6 ? <span className="ml-3 text-xs text-muted-foreground">+{people.length - 6}</span> : null}
  </span>
}

/**
 * A step someone is past due on. In a learner's thread, staff nudge them; in a group's, everyone
 * past due on it at once. A nudge is the step reminder learners get (once a day at most).
 */
export function PastDueCard({ line, learner, orgId, token, onPerson }: {
  line: PastDueItem
  /** In a learner's thread: who to nudge. */
  learner?: PersonSummary
  orgId: number
  token?: string
  onPerson?: (person: PersonSummary) => void // eslint-disable-line no-unused-vars
}) {
  const [sent, setSent] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const people = line.learners || []
  const nudge = async () => {
    if (!line.step_key) return
    setBusy(true)
    try {
      const result = await goalAdminApi.remind(orgId, line.assignment_uuid, line.step_key, learner?.user_uuid ? { user_uuids: [learner.user_uuid] } : {}, token)
      if (result.reminded.length) setSent(true)
      else toast(result.skipped[0]?.reason || 'They were reminded recently')
    } catch (error: any) {
      toast.error(error?.message || 'That reminder didn’t send')
    } finally {
      setBusy(false)
    }
  }
  const first = learner?.name.split(' ')[0]
  return <Notice icon={Clock} tone="bad">
    <span><b>{line.title}</b> is past due{line.due_date ? ` · was due ${shortDate(line.due_date)}` : ''}{people.length ? ` for ${people.length === 1 ? people[0].name : `${people.length} learners`}` : ''}</span>
    <span className="flex flex-wrap items-center gap-2">
      {people.length ? <Faces people={people} onPerson={onPerson} /> : null}
      {sent ? <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300"><Check size={14} aria-hidden="true" />{learner ? 'Reminder sent' : 'Reminded each of them'}</span>
        : <button type="button" disabled={busy} onClick={nudge} className={plain}><BellRing size={14} aria-hidden="true" />{learner ? `Nudge ${first}` : people.length > 1 ? `Nudge all ${people.length}` : 'Nudge'}</button>}
    </span>
  </Notice>
}

/** Where a turn-in's Review goes: the assignment's review at that step, or the plan's feed when nobody assigned it. */
export function turnInHref(item: ReviewItem) {
  return item.assignment_uuid ? reviewHref({ assignment: item.assignment_uuid, stepKey: item.step_key, stepUuid: item.step_key ? null : item.step_uuid, focus: item.step_uuid })
    : routePaths.org.admin.learnerFeed(item.goal_uuid)
}

/** Work a learner turned in that waits on a review, with the way to it. */
export function ReviewCard({ item, reviewHref }: { item: ReviewItem; reviewHref?: string }) {
  return <Notice icon={ClipboardCheck}>
    <span>Turned in <b>{item.title}</b></span>
    {reviewHref ? <span><Link href={reviewHref} className={primary}><ClipboardCheck size={14} aria-hidden="true" />Review</Link></span> : null}
  </Notice>
}

/** A learner asked for a helper on a plan; admins approve or decline right here. */
export function RequestCard({ request, orgId, token, onDone }: { request: ThreadRequest; orgId: number; token?: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const decide = async (approve: boolean) => {
    setBusy(true)
    try {
      await peopleApi.decideHelper(orgId, request.invitation_uuid, approve, token)
      toast.success(approve ? 'Helper approved' : 'Request declined')
      onDone()
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t go through')
    } finally {
      setBusy(false)
    }
  }
  const helper = request.helper?.name || request.email
  return <Notice icon={Hand} tone="warn">
    <span><b>{request.learner?.name.split(' ')[0] || 'They'}</b> asked to add {helper}{request.role ? ` as ${request.role.name.toLowerCase()}` : ''} on {request.goal.title}</span>
    <span className="text-xs text-muted-foreground">Helpers see {request.goal.title} only, and can message staff about it.</span>
    <span className="flex gap-2">
      <button type="button" disabled={busy} onClick={() => decide(true)} className={primary}><Check size={14} aria-hidden="true" />Approve</button>
      <button type="button" disabled={busy} onClick={() => decide(false)} className={plain}>Decline</button>
    </span>
  </Notice>
}

/** In a group's thread: who asked about a step in their own thread, to answer there. */
export function AskedCard({ item, onPerson }: { item: AskedItem; onPerson: (person: PersonSummary) => void }) { // eslint-disable-line no-unused-vars
  return <Notice icon={MessageCircleQuestion} tone="warn">
    <span>{item.learners.length === 1 ? `${item.learners[0].name} asked` : `${item.learners.length} learners asked`} about <b>{item.title}</b></span>
    <span className="flex items-center gap-3"><Faces people={item.learners} onPerson={onPerson} /><span className="text-xs text-muted-foreground">Open one to answer in their thread</span></span>
  </Notice>
}
