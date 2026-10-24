'use client'

import React from 'react'
import useSWR from 'swr'
import { ChevronRight, Clock, Lock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import ChatWorkspace from '@components/Connect/workspace/ChatWorkspace'
import type { TimelineItem } from '@components/Connect/workspace/staffNotes'
import { PersonTile } from '@components/Assignments/Pair'
import { connectApi, connectKeys, type MessageAudience } from '@services/connect/connect'
import { assignmentApi, assignmentKeys, type AssignmentDetail, type AssignmentPerson, type PastDueLine, type StepQuestion } from '@services/assignments/assignments'
import { personLabel, plural, shortDate } from '@services/assignments/status'

/** Which thread the drawer shows: the group's, or one learner's chat with the organization, maybe on one step. */
export type MessagesTarget = { kind: 'group'; step?: string } | { kind: 'learner'; person: AssignmentPerson; step?: string }

const AUDIENCES: Array<{ value: MessageAudience; label: string }> = [{ value: 'all', label: 'All' }, { value: 'learner', label: 'Learners see' }, { value: 'staff', label: 'Staff only' }]

/**
 * An assignment's messages, beside the page: the group's thread, or a learner's messages on this
 * plan. Both filter to a step and to who reads them, and staff can write Staff only. On a step,
 * the group thread lists what learners asked about it in their own messages; a learner's shows a
 * line for each step they're past due on.
 */
export default function MessagesDrawer({ detail, target, setTarget, orgId, token, orgslug, onClose }: {
  detail: AssignmentDetail
  target: MessagesTarget
  setTarget: (target: MessagesTarget) => void // eslint-disable-line no-unused-vars
  orgId: number
  token?: string
  orgslug: string
  onClose: () => void
}) {
  const [audience, setAudience] = React.useState<MessageAudience>('all')
  React.useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !(event.target as HTMLElement)?.closest?.('[role="textbox"], [role="menu"]')) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  const title = target.kind === 'group' ? detail.target.name : personLabel(target.person)
  const sub = target.kind === 'group' ? `${plural(detail.learner_count, 'learner')} and ${plural(detail.staff.length, 'staff member')}` : `Messages with your organization · showing ${detail.plan.title}`
  return <>
    <div className="fixed inset-0 z-40 bg-foreground/20" onClick={onClose} aria-hidden="true" />
    <aside role="dialog" aria-label={`Messages: ${title}`} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border bg-background shadow-2xl">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="min-w-0 flex-1"><b className="block truncate text-base font-bold">{title}</b><span className="block truncate text-[12.5px] text-muted-foreground">{sub}</span></span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"><X size={18} /></button>
      </header>
      <div role="radiogroup" aria-label="Show" className="flex shrink-0 gap-0.5 px-4 pt-3">
        <span className="inline-flex rounded-xl bg-muted p-[3px]">
          {AUDIENCES.map((option) => <button key={option.value} type="button" role="radio" aria-checked={audience === option.value} onClick={() => setAudience(option.value)}
            className={cn('inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] font-semibold', audience === option.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            {option.value === 'staff' ? <Lock size={13} aria-hidden="true" /> : null}{option.label}
          </button>)}
        </span>
      </div>
      {target.kind === 'group'
        ? <GroupThread detail={detail} step={target.step} audience={audience} orgId={orgId} token={token} orgslug={orgslug} onLearner={(person) => setTarget({ kind: 'learner', person, step: target.step })} />
        : <LearnerThread detail={detail} person={target.person} step={target.step} audience={audience} orgId={orgId} token={token} orgslug={orgslug} />}
    </aside>
  </>
}

function GroupThread({ detail, step, audience, orgId, token, orgslug, onLearner }: {
  detail: AssignmentDetail; step?: string; audience: MessageAudience; orgId: number; token?: string; orgslug: string
  onLearner: (person: AssignmentPerson) => void // eslint-disable-line no-unused-vars
}) {
  const uuid = detail.assignment_uuid
  const { data: cohort } = useSWR(token ? connectKeys.cohortChat(orgId, uuid, 'group') : null, () => connectApi.cohortChat(orgId, uuid, 'group', token))
  const { data: thread } = useSWR(token && step && audience !== 'staff' ? assignmentKeys.thread(orgId, uuid, { step }) : null, () => assignmentApi.thread(orgId, uuid, token, { step }))
  if (!cohort?.conversation_uuid) return <div className="flex-1" />
  const questions = step && audience !== 'staff' ? thread?.questions || [] : []
  return <ChatWorkspace key={`${cohort.conversation_uuid}:${step || ''}`} source={{ chatUuid: cohort.conversation_uuid }} orgslug={orgslug} token={token} audience={audience}
    initialFilter={{ goal_uuid: cohort.topic.goal_uuid, step_uuid: step }} steps={cohort.topic} empty="No messages here yet."
    footer={questions.length ? <Questions questions={questions} detail={detail} onLearner={onLearner} /> : null} />
}

function Questions({ questions, detail, onLearner }: { questions: StepQuestion[]; detail: AssignmentDetail; onLearner: (person: AssignmentPerson) => void }) { // eslint-disable-line no-unused-vars
  return <section className="mx-auto mb-4 w-full max-w-[46rem] rounded-2xl border border-border p-3">
    <b className="mb-2 block text-xs font-bold text-muted-foreground">Questions about this step, in learners’ messages</b>
    <div className="flex flex-col gap-1.5">{questions.map((question) => {
      const person = question.person && (detail.people[String(question.person.id)] || question.person)
      return <button key={question.message_uuid} type="button" disabled={!person} onClick={() => person && onLearner(person)}
        className="flex items-start gap-2.5 rounded-xl border border-ask-soft px-3 py-2.5 text-left text-[13.5px] leading-snug hover:bg-muted">
        <PersonTile person={person} size="sm" />
        <span className="min-w-0 flex-1"><b className="block text-xs text-muted-foreground">{personLabel(person)}</b>{question.body}</span>
        <ChevronRight size={16} className="mt-1 text-muted-foreground" aria-hidden="true" />
      </button>
    })}</div>
  </section>
}

function PastDue({ line }: { line: PastDueLine }) {
  return <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
    <Clock size={13} className="text-late" aria-hidden="true" /><span>{line.title} is past due{line.due_date ? ` · was due ${shortDate(line.due_date)}` : ''}</span>
  </div>
}

function LearnerThread({ detail, person, step, audience, orgId, token, orgslug }: {
  detail: AssignmentDetail; person: AssignmentPerson; step?: string; audience: MessageAudience; orgId: number; token?: string; orgslug: string
}) {
  const uuid = detail.assignment_uuid
  const userUuid = person.user_uuid || ''
  const { data: thread } = useSWR(token && userUuid ? assignmentKeys.learnerThread(orgId, uuid, userUuid, { step }) : null, () => assignmentApi.learnerThread(orgId, uuid, userUuid, token, { step }))
  const timeline = React.useMemo<TimelineItem[]>(() => audience === 'staff' ? [] : (thread?.past_due || []).map((line) => ({ key: `due:${line.step_key}`, at: `${line.due_date || ''}T23:59:00`, node: <PastDue line={line} /> })), [thread, audience])
  if (!thread) return <div className="flex-1" />
  return <ChatWorkspace key={`${thread.goal_uuid}:${step || ''}`} source={{ orgId, userId: person.id }} orgslug={orgslug} token={token} audience={audience}
    initialFilter={{ goal_uuid: thread.goal_uuid, step_uuid: thread.step_uuid || undefined }}
    timeline={timeline} timelineFiltered empty="No messages here yet." />
}
