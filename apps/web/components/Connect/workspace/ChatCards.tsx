'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { BarChart3, Bell, Building2, Check, GraduationCap, Loader2, Mail, MessageCircle, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { ChatMessage, ChatTopic, InvitationCard, MessageRef, ProgressCard, StepReminderCard } from '@services/connect/connect'
import type { GroupReportCard } from '@services/goals/reports'
import { insightsRoutes } from '@components/Goals/admin/insights/reportRoutes'
import { goalsApi } from '@services/goals/goals'
import { messagesApi } from '@services/messages/messages'
import { supportApi, type SupportRequestCard } from '@services/school/support'
import { PlanTag, StepMark } from './tags'

import { tr } from '@/lib/tr'
const VERBS: Record<string, string> = { get finished() { return tr('lit.chat_cards.finished', 'Finished') }, get turned_in() { return tr('lit.chat_cards.turned_in', 'Turned in') }, get approved() { return tr('lit.chat_cards.approved', 'Approved') }, get changes() { return tr('lit.chat_cards.asked_for_changes', 'Asked for changes') }, get marked_done() { return tr('lit.chat_cards.marked_done', 'Marked done') }, get excused() { return tr('lit.step_text.excused', 'Excused') } }
const ANSWERED: Record<string, string> = { get accepted() { return tr('lit.chat_cards.accepted', 'Accepted') }, get declined() { return tr('lit.chat_cards.declined', 'Declined') }, get expired() { return tr('lit.chat_cards.no_longer_open', 'No longer open') }, get revoked() { return tr('lit.chat_cards.withdrawn', 'Withdrawn') } }

/** A card the app posted into the chat, or null for an ordinary message. */
// eslint-disable-next-line no-unused-vars
export function CardMessage({ message, orgslug, token, topics, time, first, onTag, onAnswered }: { message: ChatMessage; orgslug: string; token?: string; topics: ChatTopic[]; time: string; first: boolean; onTag: (ref: MessageRef) => void; onAnswered: () => void }) {
  const card = message.card
  const who = message.sender?.name || tr('lit.chat_cards.someone', 'Someone')
  if (message.kind !== 'card' || !card) return null
  if (card.type === 'plan_progress') return <li className="my-3 flex">
    <ProgressView card={card} who={message.mine ? tr('lit.chat_cards.you', 'You') : who} time={time} topic={topics.find((item) => item.goal_uuid === card.goal_uuid)} onTag={onTag} />
  </li>
  if (card.type === 'invitation') return <li className="my-2 flex justify-start">
    <InvitationView card={card} orgslug={orgslug} token={token} time={time} onAnswered={onAnswered} />
  </li>
  if (card.type === 'support_request') return <li className="my-2 flex justify-start">
    <SupportView card={card} token={token} time={time} onAnswered={onAnswered} />
  </li>
  if (card.type === 'notice') return <li className={cn('flex justify-start', first && 'mt-2')}>
    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-[hsl(var(--raised)/0.55)] px-4 py-2.5 text-sm leading-6">
      <span className="block font-bold">{card.subject}</span>{card.text}
      <span className="ml-2 inline-block align-bottom text-[10px] text-muted-foreground">{time}</span>
    </div>
  </li>
  if (card.type === 'event') return <li className="my-3 flex justify-center">
    <span className="rounded-full bg-[hsl(var(--raised)/0.55)] px-3 py-1 text-center text-xs text-muted-foreground">{message.mine ? `You ${card.verb}` : message.body}<span className="ml-1.5">· {time}</span></span>
  </li>
  if (card.type === 'step_reminder') return <li className={cn('flex justify-start', first && 'mt-2')}>
    <ReminderView card={card} who={message.mine ? tr('lit.chat_cards.you', 'You') : who} time={time} onTag={onTag} />
  </li>
  if (card.type === 'group_report') return <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start', 'mt-2')}>
    <ReportView card={card} who={message.mine ? tr('lit.chat_cards.you', 'You') : who} orgslug={orgslug} time={time} />
  </li>
  if (card.type === 'org_mention') return <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start', 'mt-2')}>
    <div className="w-full max-w-[360px] rounded-2xl bg-background p-3.5">
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-400"><Building2 size={14} />{tr('connect.chat_cards.shared_with_you', 'Shared with you')}</span>
      <span className="mt-1 block font-bold leading-snug">{message.mine ? message.body : `${who} ${message.body.charAt(0).toLowerCase()}${message.body.slice(1)}`}</span>
      {card.excerpt ? <span className="mt-1 line-clamp-3 block text-sm text-muted-foreground">&ldquo;{card.excerpt}&rdquo;</span> : null}
      <span className="mt-2 block text-right text-xs text-muted-foreground">{time}</span>
    </div>
  </li>
  const goal = card.type === 'goal_comments'
  const href = goal ? getUriWithOrg(orgslug, routePaths.org.plan(card.goal_uuid)) : getUriWithOrg(orgslug, `/user/${encodeURIComponent(card.username)}`)
  return <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start', first && 'mt-2')}>
    <Link href={href} className="block w-full max-w-[340px] rounded-2xl bg-background p-3.5 transition-colors hover:bg-muted/60">
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[var(--org-primary-color)]">{goal ? <MessageCircle size={14} /> : <UserRound size={14} />}{goal ? tr('connect.chat_cards.comments', 'Comments') : tr('connect.chat_cards.portfolio', 'Portfolio')}</span>
      <span className="mt-1 block font-black leading-snug">{message.body}</span>
      {card.excerpt ? <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">&ldquo;{card.excerpt}&rdquo;</span> : null}
      <span className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span className="font-semibold text-foreground">{goal ? tr('connect.chat_cards.open_goal', 'Open goal') : tr('connect.chat_cards.open_portfolio', 'Open portfolio')} &rarr;</span>{time}</span>
    </Link>
  </li>
}

/** An invitation, answered right here: join the organization, start the plan, or help on it. */
function InvitationView({ card, orgslug, token, time, onAnswered }: { card: InvitationCard; orgslug: string; token?: string; time: string; onAnswered: () => void }) {
  const [busy, setBusy] = React.useState<'accept' | 'decline' | ''>('')
  const answer = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline')
    try {
      if (card.source === 'goal' && card.goal_uuid) await goalsApi.respond(card.goal_uuid, accept, token)
      else if (card.inbox_uuid) await messagesApi.respond(card.inbox_uuid, accept, token)
      onAnswered()
    } catch (error: any) {
      toast.error(error?.message || tr('connect.chat_cards.that_didn_t_go_through', 'That didn’t go through'))
    } finally {
      setBusy('')
    }
  }
  const pending = card.state === 'pending'
  const plan = card.goal_uuid ? getUriWithOrg(orgslug, routePaths.org.plan(card.goal_uuid)) : null
  return <div className="w-full max-w-[380px] rounded-2xl bg-[hsl(var(--raised)/0.55)] p-3.5">
    <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Mail size={13} />{tr('connect.chat_cards.invitation', 'Invitation')}<span className="ml-auto font-normal">{time}</span></span>
    <span className="mt-1.5 block font-bold leading-snug">{card.subject}</span>
    <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">{card.for_me ? card.text : tr('connect.chat_cards.sent_to_value', 'Sent to {{value}}', { value: card.for_name || tr('connect.chat_cards.v_them', 'them') })}</span>
    <div className="mt-3 flex items-center gap-2">
      {plan && (card.for_me || !pending) ? <Link href={plan} className="text-sm font-semibold hover:underline">{tr('connect.chat_cards.view_plan', 'View plan')}</Link> : null}
      {pending && card.for_me ? <span className="ml-auto flex gap-1.5">
        <button type="button" disabled={Boolean(busy)} onClick={() => answer(false)} className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground disabled:opacity-50">{busy === 'decline' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}{tr('connect.chat_cards.decline', 'Decline')}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => answer(true)} className="flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-xs font-bold text-background disabled:opacity-50">{busy === 'accept' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{tr('connect.chat_cards.accept', 'Accept')}</button>
      </span> : <span className="ml-auto text-xs font-semibold text-muted-foreground">{pending ? tr('connect.chat_cards.waiting_for_an_answer', 'Waiting for an answer') : ANSWERED[card.state] || card.state}</span>}
    </div>
  </div>
}

const SUPPORT_STATES: Record<SupportRequestCard['state'], string> = { get pending() { return tr('lit.chat_cards.waiting_for_an_answer', 'Waiting for an answer') }, get accepted() { return tr('lit.chat_cards.accepted', 'Accepted') }, get declined() { return tr('lit.chat_cards.declined', 'Declined') }, get ended() { return tr('lit.chat_cards.stopped', 'Stopped') }, get expired() { return tr('lit.chat_cards.no_longer_open', 'No longer open') } }

/**
 * A school asking to support the learner's Education Plan and Profile. The learner answers here, and can
 * stop it here later; until they say yes the school's staff see none of their school record.
 */
function SupportView({ card, token, time, onAnswered }: { card: SupportRequestCard; token?: string; time: string; onAnswered: () => void }) {
  const [busy, setBusy] = React.useState<'accept' | 'decline' | 'stop' | ''>('')
  const act = async (kind: 'accept' | 'decline' | 'stop') => {
    if (kind === 'stop' && !confirm(`Stop sharing with ${card.org_name}? Its staff lose access until you say yes to a new ask.`)) return
    setBusy(kind)
    try {
      if (kind === 'stop') await supportApi.stop(card.support_uuid, token)
      else await supportApi.answer(card.support_uuid, kind === 'accept', card.request_uuid, token)
      onAnswered()
    } catch (error: any) {
      toast.error(error?.message || tr('connect.chat_cards.that_didn_t_go_through', 'That didn’t go through'))
    } finally {
      setBusy('')
    }
  }
  const pending = card.state === 'pending'
  const button = 'flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold disabled:opacity-50'
  return <div className="w-full max-w-[400px] rounded-2xl bg-[hsl(var(--raised)/0.55)] p-3.5">
    <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><GraduationCap size={14} aria-hidden="true" />{tr('connect.chat_cards.school_support', 'School support')}<span className="ml-auto font-normal">{time}</span></span>
    <span className="mt-1.5 block font-bold leading-snug">{card.for_me ? tr('connect.chat_cards.org_name_would_like_to', '{{org_name}} would like to support your plan', { org_name: card.org_name }) : tr('connect.chat_cards.org_name_asked_to_support', '{{org_name}} asked to support their plan', { org_name: card.org_name })}</span>
    {card.for_me ? <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">{card.text}</span> : null}
    <div className="mt-3 flex items-center gap-2">
      {pending && card.for_me ? <span className="ml-auto flex gap-1.5">
        <button type="button" disabled={Boolean(busy)} onClick={() => act('decline')} className={cn(button, 'text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground')}>{busy === 'decline' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}{tr('connect.chat_cards.not_now', 'Not now')}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => act('accept')} className={cn(button, 'bg-foreground text-background')}>{busy === 'accept' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{tr('connect.chat_cards.yes_share', 'Yes, share')}</button>
      </span> : <>
        <span className="text-xs font-semibold text-muted-foreground">{card.state === 'accepted' && card.for_me ? tr('connect.chat_cards.org_name_supports_you', '{{org_name}} supports you', { org_name: card.org_name }) : SUPPORT_STATES[card.state] || card.state}</span>
        {card.state === 'accepted' && card.for_me ? <Link href={getUriWithOrg(card.org_slug, routePaths.org.epp())} className={cn(button, 'ml-auto bg-foreground text-background')}>{tr('connect.chat_cards.my_plan', 'My plan')}</Link> : null}
        {card.state === 'accepted' && card.for_me ? <button type="button" disabled={Boolean(busy)} onClick={() => act('stop')} className={cn(button, 'text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground')}>{busy === 'stop' ? <Loader2 size={13} className="animate-spin" /> : null}{tr('connect.chat_cards.stop_sharing', 'Stop sharing')}</button> : null}
      </>}
    </div>
  </div>
}

/** What happened on a plan, and where it stands now. */
// eslint-disable-next-line no-unused-vars
function ProgressView({ card, who, time, topic, onTag }: { card: ProgressCard; who: string; time: string; topic?: ChatTopic; onTag: (ref: MessageRef) => void }) {
  const progress = topic?.progress
  const statuses = topic?.steps.map((item) => item.status === 'completed' || item.status === 'excused' ? 'done' : item.status === 'submitted' ? 'review' : item.behind ? 'behind' : 'todo') || []
  // The app's own note, so it sits on the surface without a bubble, as Coach's replies do.
  return <div className="w-full max-w-[460px] py-0.5">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <PlanTag title={card.goal_title} onClick={() => onTag({ kind: 'plan', key: `plan:${card.goal_uuid}`, goal_uuid: card.goal_uuid, title: card.goal_title })} />
      <span className="ml-auto">{time}</span>
    </div>
    <p className="mt-2 text-sm font-bold">{card.started && !card.events.length ? `${who} started ${card.goal_title}` : `${who} ${card.events.length === 1 ? VERBS[card.events[0].event].toLowerCase() : 'made progress'}`}</p>
    {card.events.length ? <ul className="mt-1.5 space-y-1">{card.events.map((event) => {
      const status = topic?.steps.find((item) => item.step_uuid === event.step_uuid)?.status || (event.event === 'turned_in' ? 'submitted' : event.event === 'changes' ? 'changes_requested' : 'completed')
      return <li key={event.step_uuid} className="text-sm"><div className="flex items-center gap-2">
        <StepMark status={status} className="h-4 w-4" />
        <button type="button" onClick={() => onTag({ kind: 'step', key: `step:${card.goal_uuid}/${event.step_uuid}`, goal_uuid: card.goal_uuid, step_uuid: event.step_uuid, title: event.title, plan_title: card.goal_title, status })}
          className="min-w-0 truncate text-left hover:underline">{event.title}</button>
        {card.events.length > 1 ? <span className="shrink-0 text-xs text-muted-foreground">{VERBS[event.event]}</span> : null}
        {status === 'submitted' ? <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{tr('connect.chat_cards.awaiting_review', 'Awaiting review')}</span> : null}
      </div>
      {event.note ? <p className="ml-6 mt-0.5 whitespace-pre-wrap break-words border-l-2 border-border pl-2 text-xs text-muted-foreground">{event.note}</p> : null}
      </li>
    })}</ul> : null}
    {progress && progress.total ? <div className="mt-3 space-y-1.5">
      <div className="flex gap-0.5" aria-hidden="true">{statuses.map((status, index) => <span key={index} className={cn('h-1.5 flex-1 rounded-full', status === 'done' ? 'bg-emerald-600' : status === 'review' ? 'bg-amber-500' : status === 'behind' ? 'bg-red-500' : 'bg-muted')} />)}</div>
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span><b className="text-foreground">{progress.done}</b>{' '}{tr('connect.chat_cards.of_total_done', 'of {{total}} done', { total: progress.total })}</span>
        {progress.submitted ? <span><b className="text-foreground">{progress.submitted}</b>{' '}{tr('connect.chat_cards.awaiting_review_2', 'awaiting review')}</span> : null}
        {progress.behind ? <span><b className="text-foreground">{progress.behind}</b>{' '}{tr('connect.chat_cards.behind', 'behind')}</span> : null}
      </p>
    </div> : null}
  </div>
}

/** A group's progress report a colleague sent. It opens the live report, so it stays current. */
function ReportView({ card, who, orgslug, time }: { card: GroupReportCard; who: string; orgslug: string; time: string }) {
  const href = getUriWithOrg(card.org_slug || orgslug, insightsRoutes.report(card.usergroup_id, card.frameworks || []))
  const { summary } = card
  return <Link href={href} className="block w-full max-w-[380px] rounded-2xl bg-background p-3.5 transition-colors hover:bg-muted/60">
    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[var(--org-primary-color)]"><BarChart3 size={14} aria-hidden="true" />{tr('connect.chat_cards.progress_report', 'Progress report')}<span className="ml-auto font-normal normal-case tracking-normal text-muted-foreground">{time}</span></span>
    <span className="mt-1 block font-black leading-snug">{card.group_name}</span>
    <span className="mt-0.5 block text-xs text-muted-foreground">{tr('connect.chat_cards.who_sent_it', '{{who}} sent it', { who })}{card.framework_names?.length ? tr('connect.chat_cards.with_join_draft', ' · with {{join}} (draft)', { join: card.framework_names.join(', ') }) : ''}</span>
    {card.message ? <span className="mt-2 block whitespace-pre-wrap break-words text-sm">{card.message}</span> : null}
    <span className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      <span><b className="text-foreground">{summary.progress_percent}%</b>{' '}{tr('connect.chat_cards.of_steps_done', 'of steps done')}</span>
      <span><b className="text-foreground">{summary.behind_count}</b>{' '}{tr('connect.chat_cards.behind', 'behind')}</span>
      <span><b className="text-foreground">{summary.badges_earned}</b>{' '}{tr('connect.chat_cards.badge', 'badge')}{summary.badges_earned === 1 ? '' : 's'}{' '}{tr('connect.chat_cards.earned', 'earned')}</span>
    </span>
    <span className="mt-2 block text-xs font-semibold text-foreground">Open report &rarr;</span>
  </Link>
}

/** Staff nudged the learner about a step that's waiting on them. */
// eslint-disable-next-line no-unused-vars
function ReminderView({ card, who, time, onTag }: { card: StepReminderCard; who: string; time: string; onTag: (ref: MessageRef) => void }) {
  const due = card.due_date ? new Date(`${card.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }) : null
  return <div className="w-full max-w-[400px] rounded-2xl bg-background p-3.5">
    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-400"><Bell size={14} aria-hidden="true" />{tr('connect.chat_cards.reminder', 'Reminder')}<span className="ml-auto font-normal normal-case tracking-normal text-muted-foreground">{time}</span></span>
    <span className="mt-1 block font-bold leading-snug">{tr('connect.chat_cards.who_sent_a_reminder_aboutvalue', '{{who}} sent a reminder about{{value}}', { who, value: ' ' })}
      <button type="button" className="hover:underline" onClick={() => onTag({ kind: 'step', key: `step:${card.goal_uuid}/${card.step_uuid}`, goal_uuid: card.goal_uuid, step_uuid: card.step_uuid, title: card.step_title, plan_title: card.goal_title, status: 'not_started' })}>{card.step_title}</button>
    </span>
    <span className="mt-0.5 block text-xs text-muted-foreground">{card.goal_title}{due ? tr('connect.chat_cards.due_due', ' · due {{due}}', { due }) : ''}</span>
    {card.message ? <span className="mt-2 block whitespace-pre-wrap break-words text-sm">{card.message}</span> : null}
  </div>
}
