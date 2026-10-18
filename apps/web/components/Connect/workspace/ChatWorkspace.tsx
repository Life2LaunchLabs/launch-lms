'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr'
import toast from 'react-hot-toast'
import { ArrowUpRight, Building2, Flag, MessageCircle, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type Chat, type ChatFilter, type ChatMessage, type ChatTopic, type MessageRef, type ProgressCard } from '@services/connect/connect'
import { schoolApi, schoolKeys } from '@services/school/school'
import { useChatList } from '../useConnect'
import TagComposer, { type TagComposerHandle, type TagOrg } from './TagComposer'
import { MessageText, PlanTag, StepMark } from './tags'

const CHAT_REFRESH_MS = 5_000

/** A chat by its id, or a learner's chat with an organization as its staff see it. */
export type ChatSource = { chatUuid: string } | { orgId: number; userId: number }

function useWorkspaceChat(source: ChatSource, filter: ChatFilter, token?: string) {
  const key = 'chatUuid' in source ? connectKeys.chat(source.chatUuid, filter) : schoolKeys.studentChat(source.orgId, source.userId, filter)
  return useSWR<Chat>(token ? key : null, () => 'chatUuid' in source ? connectApi.chat(source.chatUuid, token, filter) : schoolApi.studentChat(source.orgId, source.userId, token, filter),
    { refreshInterval: CHAT_REFRESH_MS, revalidateOnFocus: true, keepPreviousData: true })
}

/**
 * A chat as the shared workspace on someone's plans: filter by plan and then by step, read the
 * talk and the app's progress cards together, and write with plans, steps and people tagged.
 * A step's comments are this chat filtered to the step, wherever it's opened from.
 */
export default function ChatWorkspace({ source, orgslug, token, initialFilter = {}, header, blocked, empty, stepHref, onChat }: {
  source: ChatSource
  orgslug: string
  token?: string
  initialFilter?: ChatFilter
  /** Above the filters, given the chat once it loads. */
  // eslint-disable-next-line no-unused-vars
  header?: (chat: Chat | undefined, mutate: KeyedMutator<Chat>) => React.ReactNode
  /** Why the composer is off, if it is (a request not yet accepted, a blocked chat). */
  // eslint-disable-next-line no-unused-vars
  blocked?: (chat: Chat) => string
  empty?: React.ReactNode
  /** Where a step opens for whoever is reading: the learner's plan, or staff's view of it. */
  // eslint-disable-next-line no-unused-vars
  stepHref?: (goalUuid: string, stepUuid: string) => string
  // eslint-disable-next-line no-unused-vars
  onChat?: (chat: Chat) => void
}) {
  const [filter, setFilter] = React.useState<ChatFilter>(initialFilter)
  const { data: chat, error, mutate } = useWorkspaceChat(source, filter, token)
  const { data: list } = useChatList()
  const { mutate: mutateGlobal } = useSWRConfig()
  const composer = React.useRef<TagComposerHandle>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const topics = chat?.topics || []
  const plan = topics.find((item) => item.goal_uuid === filter.goal_uuid)
  const step = plan?.steps.find((item) => item.step_uuid === filter.step_uuid)

  const lastStamp = chat?.messages.at(-1)?.update_date
  React.useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }) }, [lastStamp, filter.goal_uuid, filter.step_uuid])
  React.useEffect(() => { if (chat) onChat?.(chat) }, [chat, onChat])
  // Reading the chat clears its unread count, but a request stays unanswered until accepted.
  const unread = chat?.unread || 0
  const uuid = chat?.conversation_uuid
  React.useEffect(() => {
    if (!token || !unread || !uuid || chat?.status !== 'active') return
    void connectApi.read(uuid, token).then(() => { void mutateGlobal(connectKeys.chats()); void mutateGlobal(connectKeys.counts()) })
  }, [token, uuid, unread, chat?.status, mutateGlobal])
  // Looking at a step or a plan, a new message starts out tagged with it.
  React.useEffect(() => { composer.current?.prefill(plan ? { plan, step } : null) }, [plan?.goal_uuid, step?.step_uuid]) // eslint-disable-line react-hooks/exhaustive-deps

  const orgs = React.useMemo<TagOrg[]>(() => {
    const seen = new Map<string, TagOrg>()
    for (const item of [chat, ...(list?.chats || [])]) if (item?.org) seen.set(item.org.org_uuid, { org_uuid: item.org.org_uuid, name: item.org.name })
    return [...seen.values()]
  }, [chat, list])

  const openTag = (ref: MessageRef) => {
    if (ref.kind === 'plan') setFilter({ goal_uuid: ref.goal_uuid })
    else if (ref.kind === 'step') setFilter({ goal_uuid: ref.goal_uuid, step_uuid: ref.step_uuid })
  }
  const send = async (body: string) => {
    if (!chat) return false
    try {
      const sent = await connectApi.send(chat.conversation_uuid, body, token)
      for (const outcome of sent.mentions || []) {
        if (outcome.status === 'invited') toast.success(`Invited ${outcome.user.name} as a commenter`)
        else if (outcome.status === 'requested') toast.success(`Asked the plan’s admins to add ${outcome.user.name}`)
        else if (outcome.status === 'no_access' || outcome.status === 'not_here') toast(`${outcome.user.name} isn’t in this chat`)
      }
      await mutate()
      void mutateGlobal(connectKeys.chats())
      return true
    } catch (sendError: any) {
      toast.error(sendError?.message || 'That message didn’t send')
      return false
    }
  }

  const reason = chat ? (blocked?.(chat) || (chat.can_post ? '' : 'You can read along here')) : ''
  const names = chat ? chat.kind !== 'direct' : false
  return <>
    {header?.(chat, mutate)}
    {topics.length ? <TopicFilters topics={topics} filter={filter} onChange={setFilter} stepLink={plan && step && stepHref ? stepHref(plan.goal_uuid, step.step_uuid) : undefined} /> : null}
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
      {error ? <p className="m-auto max-w-xs pt-16 text-center text-sm text-muted-foreground">This chat didn&rsquo;t load.</p>
        : !chat ? null
        : chat.messages.length ? <ol className="flex flex-col gap-1.5">
          {chat.messages.map((message, index) => <Message key={message.message_uuid} message={message} orgslug={orgslug} links={chat.accepted} names={names}
            topics={topics} inPlan={plan?.goal_uuid} onTag={openTag} first={index === 0 || chat.messages[index - 1].sender?.id !== message.sender?.id || chat.messages[index - 1].kind === 'card'} />)}
        </ol>
        : <p className="m-auto max-w-xs pt-16 text-center text-sm text-muted-foreground">{step ? `Nothing about ${step.title} yet. Anything you write here is tagged with it.` : plan ? `Nothing about ${plan.title} yet.` : empty}</p>}
    </div>
    {chat ? <div className="px-3 pb-3 md:px-4">
      <TagComposer ref={composer} topics={topics} people={chat.people} orgs={orgs} token={token} scopeGoal={filter.goal_uuid}
        placeholder={step ? `Comment on ${step.title}` : `Message ${chat.title}`} disabled={reason || undefined} onSend={send} />
    </div> : null}
  </>
}

/** Plans to filter by, and once one is picked, its steps. */
function TopicFilters({ topics, filter, onChange, stepLink }: { topics: ChatTopic[]; filter: ChatFilter; onChange: React.Dispatch<React.SetStateAction<ChatFilter>>; stepLink?: string }) {
  const plan = topics.find((item) => item.goal_uuid === filter.goal_uuid)
  const steps = React.useRef<HTMLDivElement>(null)
  // A step opened from elsewhere may sit past the edge of its row: bring it into view.
  React.useEffect(() => { steps.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [filter.step_uuid])
  const button = (on: boolean) => cn('flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors', on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted')
  return <div className="border-b border-border">
    <div role="group" aria-label="Show messages about" className="flex gap-1.5 overflow-x-auto px-3 py-2 md:px-4">
      <button type="button" aria-pressed={!plan} onClick={() => onChange({})} className={button(!plan)}>Everything</button>
      {topics.map((item) => <button key={item.goal_uuid} type="button" aria-pressed={plan?.goal_uuid === item.goal_uuid} onClick={() => onChange({ goal_uuid: item.goal_uuid })} className={button(plan?.goal_uuid === item.goal_uuid)}>
        <Flag size={12} aria-hidden="true" />{item.title}{item.count ? <span className="opacity-60">{item.count}</span> : null}
      </button>)}
    </div>
    {plan ? <div ref={steps} role="group" aria-label={`Steps in ${plan.title}`} className="flex items-center gap-1.5 overflow-x-auto px-3 pb-2 md:px-4">
      <button type="button" aria-pressed={!filter.step_uuid} onClick={() => onChange({ goal_uuid: plan.goal_uuid })} className={button(!filter.step_uuid)}>All steps</button>
      {plan.steps.map((item) => <button key={item.step_uuid} type="button" aria-pressed={filter.step_uuid === item.step_uuid} onClick={() => onChange({ goal_uuid: plan.goal_uuid, step_uuid: item.step_uuid })}
        className={button(filter.step_uuid === item.step_uuid)}>
        <StepMark status={item.status} behind={item.behind} className="h-3.5 w-3.5" /><span className="max-w-40 truncate">{item.title}</span>{item.count ? <span className="opacity-60">{item.count}</span> : null}
      </button>)}
      {stepLink ? <Link href={stepLink} className="ml-auto flex h-8 shrink-0 items-center gap-1 px-1 text-xs font-bold text-[var(--org-primary-color)] hover:underline">Open step<ArrowUpRight size={13} /></Link> : null}
    </div> : null}
  </div>
}

const VERBS: Record<string, string> = { finished: 'Finished', turned_in: 'Turned in', approved: 'Approved', changes: 'Asked for changes', marked_done: 'Marked done', excused: 'Excused' }

/** One message: text with its tags, or a card the app posted. */
// eslint-disable-next-line no-unused-vars
function Message({ message, orgslug, links, first, names, topics, inPlan, onTag }: { message: ChatMessage; orgslug: string; links: boolean; first: boolean; names: boolean; topics: ChatTopic[]; inPlan?: string; onTag: (ref: MessageRef) => void }) {
  const time = new Date(message.update_date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const card = message.card
  const who = message.sender?.name || 'Someone'
  if (message.kind === 'card' && card?.type === 'plan_progress') return <li className="my-2 flex justify-center">
    <ProgressView card={card} who={message.mine ? 'You' : who} time={time} topic={topics.find((item) => item.goal_uuid === card.goal_uuid)} onTag={onTag} />
  </li>
  if (message.kind === 'card' && card?.type === 'org_mention') return <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start', 'mt-2')}>
    <div className="w-full max-w-[360px] rounded-3xl border border-border bg-background p-3.5">
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-400"><Building2 size={14} />Shared with you</span>
      <span className="mt-1 block font-bold leading-snug">{message.mine ? message.body : `${who} ${message.body.charAt(0).toLowerCase()}${message.body.slice(1)}`}</span>
      {card.excerpt ? <span className="mt-1 line-clamp-3 block text-sm text-muted-foreground">&ldquo;{card.excerpt}&rdquo;</span> : null}
      <span className="mt-2 block text-right text-xs text-muted-foreground">{time}</span>
    </div>
  </li>
  if (message.kind === 'card' && card && (card.type === 'goal_comments' || card.type === 'portfolio_shared' || card.type === 'portfolio_comments')) {
    const goal = card.type === 'goal_comments'
    const href = goal ? getUriWithOrg(orgslug, routePaths.org.plan(card.goal_uuid)) : getUriWithOrg(orgslug, `/user/${encodeURIComponent(card.username)}`)
    return <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start', first && 'mt-2')}>
      <Link href={href} className="block w-full max-w-[340px] rounded-3xl border border-border bg-background p-3.5 transition-transform hover:-translate-y-0.5 hover:shadow-md">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[var(--org-primary-color)]">{goal ? <MessageCircle size={14} /> : <UserRound size={14} />}{goal ? 'Comments' : 'Portfolio'}</span>
        <span className="mt-1 block font-black leading-snug">{message.body}</span>
        {card.excerpt ? <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">&ldquo;{card.excerpt}&rdquo;</span> : null}
        <span className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span className="font-semibold text-foreground">{goal ? 'Open goal' : 'Open portfolio'} &rarr;</span>{time}</span>
      </Link>
    </li>
  }
  return <li className={cn('flex flex-col', message.mine ? 'items-end' : 'items-start', first && 'mt-2')}>
    {names && first && !message.mine && message.sender ? <span className="mb-0.5 px-3 text-xs font-semibold text-muted-foreground">{message.sender.name}</span> : null}
    <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
      message.mine ? 'rounded-br-md bg-[hsl(var(--raised))] text-foreground' : 'rounded-bl-md border border-border bg-card text-foreground')}>
      <MessageText body={message.body} refs={message.refs || []} links={links} inPlan={inPlan} onTag={onTag} />
      <span className="ml-2 inline-block align-bottom text-[10px] text-muted-foreground">{time}</span>
    </div>
  </li>
}

/** What happened on a plan, and where it stands now. */
// eslint-disable-next-line no-unused-vars
function ProgressView({ card, who, time, topic, onTag }: { card: ProgressCard; who: string; time: string; topic?: ChatTopic; onTag: (ref: MessageRef) => void }) {
  const progress = topic?.progress
  const statuses = topic?.steps.map((item) => item.status === 'completed' || item.status === 'excused' ? 'done' : item.status === 'submitted' ? 'review' : item.behind ? 'behind' : 'todo') || []
  return <div className="w-full max-w-[460px] rounded-2xl border border-border bg-card p-3.5">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <PlanTag title={card.goal_title} onClick={() => onTag({ kind: 'plan', key: `plan:${card.goal_uuid}`, goal_uuid: card.goal_uuid, title: card.goal_title })} />
      <span className="ml-auto">{time}</span>
    </div>
    <p className="mt-2 text-sm font-bold">{card.started && !card.events.length ? `${who} started ${card.goal_title}` : `${who} ${card.events.length === 1 ? VERBS[card.events[0].event].toLowerCase() : 'made progress'}`}</p>
    {card.events.length ? <ul className="mt-1.5 space-y-1">{card.events.map((event) => {
      const status = topic?.steps.find((item) => item.step_uuid === event.step_uuid)?.status || (event.event === 'turned_in' ? 'submitted' : event.event === 'changes' ? 'changes_requested' : 'completed')
      return <li key={event.step_uuid} className="flex items-center gap-2 text-sm">
        <StepMark status={status} className="h-4 w-4" />
        <button type="button" onClick={() => onTag({ kind: 'step', key: `step:${card.goal_uuid}/${event.step_uuid}`, goal_uuid: card.goal_uuid, step_uuid: event.step_uuid, title: event.title, plan_title: card.goal_title, status })}
          className="min-w-0 truncate text-left hover:underline">{event.title}</button>
        {card.events.length > 1 ? <span className="shrink-0 text-xs text-muted-foreground">{VERBS[event.event]}</span> : null}
        {status === 'submitted' ? <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Awaiting review</span> : null}
      </li>
    })}</ul> : null}
    {progress && progress.total ? <div className="mt-3 space-y-1.5">
      <div className="flex gap-0.5" aria-hidden="true">{statuses.map((status, index) => <span key={index} className={cn('h-1.5 flex-1 rounded-full', status === 'done' ? 'bg-emerald-600' : status === 'review' ? 'bg-amber-500' : status === 'behind' ? 'bg-red-500' : 'bg-muted')} />)}</div>
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span><b className="text-foreground">{progress.done}</b> of {progress.total} done</span>
        {progress.submitted ? <span><b className="text-foreground">{progress.submitted}</b> awaiting review</span> : null}
        {progress.behind ? <span><b className="text-foreground">{progress.behind}</b> behind</span> : null}
      </p>
    </div> : null}
  </div>
}
