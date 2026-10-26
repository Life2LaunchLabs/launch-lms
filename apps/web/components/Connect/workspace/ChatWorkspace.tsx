'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr'
import toast from 'react-hot-toast'
import { ArrowUpRight, ChevronRight, Flag, Lock, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type BlindPlan, type Chat, type ChatAudience, type ChatFilter, type ChatMessage, type ChatTopic, type MessageAudience, type MessageRef } from '@services/connect/connect'
import { isGoalsKey } from '@services/goals/goals'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import useGoalColors from '@components/Goals/learner/useGoalColors'
import { planPalette } from '@components/Goals/planColors'
import { schoolApi, schoolKeys } from '@services/school/school'
import { useChatList } from '../useConnect'
import TagComposer, { type TagComposerHandle, type TagOrg } from './TagComposer'
import { CardMessage } from './ChatCards'
import ShareSheet from './ShareSheet'
import { MessageText, StepMark } from './tags'
import { ComposeModeToggle, feedEntries, withTimeline, type ComposeMode, type TimelineItem } from './feed'

const CHAT_REFRESH_MS = 5_000

/**
 * A chat by its id, or a learner's chat with an organization as its staff see it. An
 * assignment's chat says who reads it: its staff alone, or the whole group.
 */
export type ChatSource = ({ chatUuid: string } | { orgId: number; userId: number }) & { audience?: ChatAudience }

export type { TimelineItem }

const AUDIENCE: Record<ChatAudience, { icon: React.ElementType; text: string }> = {
  staff: { icon: Users, text: 'Everyone in the group sees this' },
  group: { icon: Users, text: 'Everyone in the group sees this' },
}

function useWorkspaceChat(source: ChatSource, filter: ChatFilter, token?: string) {
  const key = 'chatUuid' in source ? connectKeys.chat(source.chatUuid, filter) : schoolKeys.studentChat(source.orgId, source.userId, filter)
  return useSWR<Chat>(token ? key : null, () => 'chatUuid' in source ? connectApi.chat(source.chatUuid, token, filter) : schoolApi.studentChat(source.orgId, source.userId, token, filter),
    { refreshInterval: CHAT_REFRESH_MS, revalidateOnFocus: true, keepPreviousData: true })
}

/**
 * A chat as the shared workspace on someone's plans: filter by plan and then by step, read the
 * talk and the app's cards together, and write with plans, steps and people tagged. What you
 * write while filtered is about that plan or step without a tag saying so. A step's comments are
 * this chat filtered to the step, wherever it's opened from.
 */
export default function ChatWorkspace({ source, orgslug, token, initialFilter = {}, filter: shownFilter, onFilter, hideTopics = false, only, title, audience, header, blocked, empty, stepHref, steps, onOpenPlan, onChat, timeline, timelineFiltered = false, footer, composer: composerOff }: {
  source: ChatSource
  orgslug: string
  token?: string
  initialFilter?: ChatFilter
  /** The plan and step shown, when the page around it keeps them (Threads' context bar); otherwise the chat keeps its own. */
  filter?: ChatFilter
  // eslint-disable-next-line no-unused-vars
  onFilter?: (filter: ChatFilter) => void
  /** The page shows its own plan and step picker. */
  hideTopics?: boolean
  /** Who you're writing to, for the composer, in place of the chat's title. */
  title?: string
  /** Only these messages, such as a thread's open questions. */
  // eslint-disable-next-line no-unused-vars
  only?: (message: ChatMessage) => boolean
  /** Whose messages to show: all, what learners see, or staff only. It stays as the plan and step filters change. */
  audience?: MessageAudience
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
  /** The plan to filter by in place of the chat's own: an assignment's template, for its cohort's chat. */
  steps?: ChatTopic
  /** Where a plan tagged from outside this chat opens; by default the learner's plan. */
  // eslint-disable-next-line no-unused-vars
  onOpenPlan?: (goalUuid: string, stepUuid?: string) => void
  // eslint-disable-next-line no-unused-vars
  onChat?: (chat: Chat) => void
  /** Cards between the messages, by time, in the unfiltered feed. */
  timeline?: TimelineItem[]
  /** The timeline already fits what the chat is filtered to, so it shows under any filter. */
  timelineFiltered?: boolean
  /** After the messages, inside the scrolling feed. */
  footer?: React.ReactNode
  /** In place of the composer, such as why nobody writes here. */
  composer?: React.ReactNode
}) {
  const [ownFilter, setOwnFilter] = React.useState<ChatFilter>(initialFilter)
  const filter = shownFilter ?? ownFilter
  const setFilter = React.useCallback((next: React.SetStateAction<ChatFilter>) => {
    const value = typeof next === 'function' ? next(filter) : next
    if (onFilter) onFilter(value)
    else setOwnFilter(value)
  }, [filter, onFilter])
  const fetched = React.useMemo(() => audience && audience !== 'all' ? { ...filter, audience } : filter, [filter, audience])
  const { data: chat, error, mutate } = useWorkspaceChat(source, fetched, token)
  const { data: list } = useChatList()
  const { mutate: mutateGlobal } = useSWRConfig()
  const router = useRouter()
  const composer = React.useRef<TagComposerHandle>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const [asking, setAsking] = React.useState<{ body: string; plans: BlindPlan[] } | null>(null)
  const topics = React.useMemo(() => steps ? [steps] : chat?.topics || [], [steps, chat?.topics])
  // Only plans under way: the ones on the Plans page, not finished ones or invitations.
  const live = React.useMemo(() => steps ? topics : topics.filter((item) => item.status === 'active'), [steps, topics])
  const session = useLHSession() as any
  const { isAdmin: isStaff } = useAdminStatus()
  const { getGoalColor } = useGoalColors(live, session?.data?.user?.id)
  const plan = topics.find((item) => item.goal_uuid === filter.goal_uuid)
  const step = plan?.steps.find((item) => item.step_uuid === filter.step_uuid)
  // Staff write here for everyone, or for staff alone.
  const [mode, setMode] = React.useState<ComposeMode>('message')
  const staffOnly = Boolean(chat?.can_post_staff_only) && mode === 'staff'
  // Reading staff-only messages, you're most likely writing one.
  React.useEffect(() => { if (audience === 'staff') setMode('staff') }, [audience])

  const shownTimeline = React.useMemo(() => filter.goal_uuid && !timelineFiltered ? [] : timeline || [], [filter.goal_uuid, timeline, timelineFiltered])
  const lastStamp = chat?.messages.at(-1)?.update_date
  const cards = shownTimeline.map((item) => item.key).join()
  React.useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }) }, [lastStamp, cards, filter.goal_uuid, filter.step_uuid])
  React.useEffect(() => { if (chat) onChat?.(chat) }, [chat, onChat])
  // Reading the chat clears its unread count, but a request stays unanswered until accepted.
  const unread = chat?.unread || 0
  const uuid = chat?.conversation_uuid
  React.useEffect(() => {
    if (!token || !unread || !uuid || chat?.status !== 'active') return
    void connectApi.read(uuid, token).then(() => { void mutateGlobal(connectKeys.chats()); void mutateGlobal(connectKeys.counts()) })
  }, [token, uuid, unread, chat?.status, mutateGlobal])

  const orgs = React.useMemo<TagOrg[]>(() => {
    const seen = new Map<string, TagOrg>()
    for (const item of [chat, ...(list?.chats || [])]) if (item?.org) seen.set(item.org.org_uuid, { org_uuid: item.org.org_uuid, name: item.org.name })
    return [...seen.values()]
  }, [chat, list])

  const openTag = (ref: MessageRef) => {
    if (ref.kind !== 'plan' && ref.kind !== 'step') return
    if (ref.hidden) return
    // A plan from outside this chat opens where it lives.
    if (ref.outside && onOpenPlan) onOpenPlan(ref.goal_uuid, ref.kind === 'step' ? ref.step_uuid : undefined)
    else if (ref.outside) router.push(ref.kind === 'step' ? `${getUriWithOrg(orgslug, routePaths.org.plan(ref.goal_uuid))}?step=${encodeURIComponent(ref.step_uuid)}` : getUriWithOrg(orgslug, routePaths.org.plan(ref.goal_uuid)))
    else setFilter(ref.kind === 'plan' ? { goal_uuid: ref.goal_uuid } : { goal_uuid: ref.goal_uuid, step_uuid: ref.step_uuid })
  }
  const send = async (body: string, share?: Record<string, string[]>) => {
    if (!chat) return false
    const scope = { goal_uuid: filter.goal_uuid, step_uuid: filter.step_uuid }
    try {
      const sent = await connectApi.send(chat.conversation_uuid, body, token, { scope, share, staffOnly })
      for (const outcome of sent.mentions || []) {
        if (outcome.status === 'invited') toast.success(`Invited ${outcome.user.name} as a commenter`)
        else if (outcome.status === 'requested') toast.success(`Asked the plan’s admins to add ${outcome.user.name}`)
        else if (outcome.status === 'no_access' || outcome.status === 'not_here') toast(`${outcome.user.name} isn’t in this chat`)
      }
      if (Object.values(sent.shared || {}).includes('requested')) toast.success('Asked the plan’s admins to share it')
      await mutate()
      void mutateGlobal(connectKeys.chats())
      return true
    } catch (sendError: any) {
      // Your plan from elsewhere: first ask who here should be able to see it.
      if (sendError?.status === 409 && sendError?.detail?.code === 'needs_access') {
        setAsking({ body, plans: sendError.detail.plans })
        return false
      }
      toast.error(sendError?.message || 'That message didn’t send')
      return false
    }
  }
  const cheer = async (message: ChatMessage) => {
    if (!chat) return
    try {
      const { reactions } = await connectApi.react(chat.conversation_uuid, message.message_uuid, token)
      await mutate((current) => current && { ...current, messages: current.messages.map((item) => item.message_uuid === message.message_uuid ? { ...item, reactions } : item) }, { revalidate: false })
    } catch (cheerError: any) {
      toast.error(cheerError?.message || 'That didn’t go through')
    }
  }
  const answered = () => {
    void mutate()
    void mutateGlobal(connectKeys.chats())
    void mutateGlobal(isGoalsKey)
  }

  const shown = React.useMemo(() => !chat ? [] : only ? chat.messages.filter(only) : chat.messages, [chat, only])
  const reason = chat ? (blocked?.(chat) || (chat.can_post ? '' : 'You can read along here')) : ''
  const names = chat ? chat.kind !== 'direct' : false
  return <>
    {header?.(chat, mutate)}
    {!hideTopics && (live.length || plan) ? <TopicFilters topics={live} plan={plan} filter={filter} onChange={setFilter} color={getGoalColor} stepLink={plan && step && stepHref ? stepHref(plan.goal_uuid, step.step_uuid) : undefined} /> : null}
    <div ref={scroller} className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-4 sm:px-6">
      {error ? <p className="m-auto max-w-xs pt-16 text-center text-sm text-muted-foreground">This chat didn&rsquo;t load.</p>
        : !chat ? null
        : shown.length || shownTimeline.length ? <ol className="mx-auto flex w-full max-w-[46rem] flex-col gap-1.5 pb-4">
          {withTimeline(feedEntries(shown), shownTimeline).map((entry, position, entries) => {
            if (entry.kind === 'card') return <li key={entry.item.key} className="my-2">{entry.item.node}</li>
            const { message } = entry
            const before = entries[position - 1]
            return <Message key={message.message_uuid} message={message} orgslug={orgslug} token={token} links={chat.accepted} names={names}
              topics={topics} filter={filter} onTag={openTag} onAnswered={answered} onCheer={chat.can_post ? cheer : undefined}
              first={!before || before.kind !== 'message' || before.message.sender?.id !== message.sender?.id || before.message.kind === 'card'} />
          })}
        </ol>
        : <p className="m-auto max-w-xs pt-16 text-center text-sm text-muted-foreground">{step ? `Nothing about ${step.title} yet. Anything you write here is about it.` : plan ? `Nothing about ${plan.title} yet. Anything you write here is about it.` : empty}</p>}
      {footer}
    </div>
    {chat && composerOff ? <div className="mx-auto w-full max-w-[47.5rem] shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">{composerOff}</div>
      : chat ? <div className="mx-auto w-full max-w-[47.5rem] shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
      {source.audience ? <AudienceLine audience={source.audience} /> : null}
      {chat.can_post_staff_only ? <ComposeModeToggle mode={mode} onChange={setMode} /> : null}
      <TagComposer ref={composer} topics={live} people={chat.people} orgs={orgs} token={token} resources={Boolean(isStaff)}
        placeholder={staffOnly ? 'Only staff will see this' : step ? `Comment on ${step.title}` : plan ? `Message ${title ? `${title} ` : ''}about ${plan.title}` : `Message ${title || chat.title}`} disabled={reason || undefined} onSend={(body) => send(body)} />
    </div> : null}
    <ShareSheet asking={asking} onClose={() => setAsking(null)}
      onSend={async (share) => { if (asking && await send(asking.body, share)) { composer.current?.clear(); setAsking(null) } }} />
  </>
}

/** Above the composer of an assignment's chat: who reads what's written here. */
function AudienceLine({ audience }: { audience: ChatAudience }) {
  const { icon: Icon, text } = AUDIENCE[audience]
  return <p className="flex items-center gap-1.5 px-1 pb-1.5 text-xs font-semibold text-muted-foreground"><Icon size={12} aria-hidden="true" />{text}</p>
}

/**
 * Plans to filter by, each in its color from the Plans page. Picking one swaps the row for that
 * plan, with an x to go back to everything, and the steps people have talked about.
 */
function TopicFilters({ topics, plan, filter, onChange, color, stepLink }: {
  topics: ChatTopic[]
  plan?: ChatTopic
  filter: ChatFilter
  onChange: React.Dispatch<React.SetStateAction<ChatFilter>>
  // eslint-disable-next-line no-unused-vars
  color: (goalUuid?: string) => string
  stepLink?: string
}) {
  const row = React.useRef<HTMLDivElement>(null)
  // A step opened from elsewhere may sit past the edge of its row: bring it into view.
  React.useEffect(() => { row.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [filter.step_uuid])
  const chip = (on: boolean) => cn('flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors',
    on ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground/85 hover:bg-muted/60 hover:text-foreground')
  const dot = (goalUuid: string) => <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: color(goalUuid) }} />
  const shell = 'flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3 py-2.5 [scrollbar-width:none] sm:px-6'
  if (!plan) return <div role="group" aria-label="Show messages about" className={shell}>
    <button type="button" aria-pressed="true" onClick={() => onChange({})} className={chip(true)}>Everything</button>
    {topics.map((item) => <button key={item.goal_uuid} type="button" aria-pressed="false" onClick={() => onChange({ goal_uuid: item.goal_uuid })} className={chip(false)}>
      {dot(item.goal_uuid)}{item.title}{item.count ? <span className="font-medium text-muted-foreground">{item.count}</span> : null}
    </button>)}
  </div>
  const face = planPalette(color(plan.goal_uuid))
  const talked = plan.steps.filter((item) => item.count > 0 || item.step_uuid === filter.step_uuid)
  return <div ref={row} role="group" aria-label={`Show messages about ${plan.title}`} className={shell}>
    <button type="button" onClick={() => onChange({})} aria-label="Show everything" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground hover:text-foreground"><X size={16} /></button>
    {/* With a step picked, a phone shows the plan as its flag so the step beside it fits without cutting the plan off. */}
    <button type="button" aria-pressed={!filter.step_uuid} onClick={() => onChange({ goal_uuid: plan.goal_uuid })} aria-label={plan.title} title={plan.title}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-opacity" style={{ background: face.deep, color: face.deepInk, opacity: filter.step_uuid ? 0.75 : 1 }}>
      <Flag size={13} aria-hidden="true" /><span className={cn(filter.step_uuid && 'hidden sm:inline')}>{plan.title}</span><ChevronRight size={14} className="-mr-1 opacity-80" aria-hidden="true" />
    </button>
    {talked.map((item) => <button key={item.step_uuid} type="button" aria-pressed={filter.step_uuid === item.step_uuid}
      onClick={() => onChange(filter.step_uuid === item.step_uuid ? { goal_uuid: plan.goal_uuid } : { goal_uuid: plan.goal_uuid, step_uuid: item.step_uuid })}
      className={chip(filter.step_uuid === item.step_uuid)}>
      <StepMark status={item.status} behind={item.behind} className="h-3.5 w-3.5" /><span className="max-w-40 truncate sm:max-w-48">{item.title}</span>{item.count ? <span className="font-medium opacity-60">{item.count}</span> : null}
    </button>)}
    {stepLink ? <Link href={stepLink} className="ml-auto flex h-9 shrink-0 items-center gap-1 px-1 text-sm font-bold text-[var(--org-primary-color)] hover:underline">Open step<ArrowUpRight size={14} /></Link> : null}
  </div>
}

/** Where a message sent while filtered belongs, shown under it when you're looking wider. */
function scopeLabel(message: ChatMessage, filter: ChatFilter) {
  const scope = message.refs?.find((ref) => (ref.kind === 'plan' || ref.kind === 'step') && ref.scope)
  if (!scope || (scope.kind !== 'plan' && scope.kind !== 'step')) return null
  if (!filter.goal_uuid) return { ref: scope, text: scope.kind === 'step' ? `${scope.plan_title} › ${scope.title}` : scope.title }
  if (filter.goal_uuid === scope.goal_uuid && !filter.step_uuid && scope.kind === 'step') return { ref: scope, text: scope.title }
  return null
}

/** One message: text with its tags, or a card the app posted. */
// eslint-disable-next-line no-unused-vars
function Message({ message, orgslug, token, links, first, names, topics, filter, onTag, onAnswered, onCheer }: { message: ChatMessage; orgslug: string; token?: string; links: boolean; first: boolean; names: boolean; topics: ChatTopic[]; filter: ChatFilter; onTag: (ref: MessageRef) => void; onAnswered: () => void; onCheer?: (message: ChatMessage) => void }) {
  const time = new Date(message.update_date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const cheers = <Cheers message={message} onCheer={onCheer} />
  if (message.kind === 'card' && message.card) return <>
    <CardMessage message={message} orgslug={orgslug} token={token} topics={topics} time={time} first={first} onTag={onTag} onAnswered={onAnswered} />
    {message.reactions?.length ? <li className="-mt-1 flex">{cheers}</li> : null}
  </>
  const scope = scopeLabel(message, filter)
  return <li className={cn('group/message flex flex-col', message.mine ? 'items-end' : 'items-start', (first || message.staff_only) && 'mt-2')}>
    {message.staff_only ? <span className="mb-0.5 flex items-center gap-1 px-3 text-[11px] font-bold text-amber-700 dark:text-amber-300"><Lock size={10} aria-hidden="true" />Staff only{!message.mine && message.sender ? ` · ${message.sender.name}` : ''}</span>
      : names && first && !message.mine && message.sender ? <span className="mb-0.5 px-3 text-xs font-semibold text-muted-foreground">{message.sender.name}</span> : null}
    {/* Coach's bubbles: yours on the raised surface as in Coach; other people's a shade apart. Only Coach goes without one. */}
    <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-6 text-foreground',
      message.staff_only ? 'border border-dashed border-amber-400/70 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100'
        : message.mine ? 'hub-user-message rounded-br-md' : 'rounded-bl-md bg-[hsl(var(--raised)/0.55)]')}>
      <MessageText body={message.body} refs={message.refs || []} links={links} inPlan={filter.goal_uuid} onTag={onTag} />
      <span className="ml-2 inline-block align-bottom text-[10px] text-muted-foreground">{time}</span>
    </div>
    {cheers}
    {scope ? <button type="button" onClick={() => onTag(scope.ref)} className="mt-0.5 flex max-w-[85%] items-center gap-1 px-3 text-[11px] text-muted-foreground hover:text-foreground hover:underline">
      <Flag size={10} aria-hidden="true" /><span className="truncate">in {scope.text}</span>
    </button> : null}
  </li>
}

/** A message's cheers, and a button to add yours that shows on hover until someone has. */
function Cheers({ message, onCheer }: { message: ChatMessage; onCheer?: (message: ChatMessage) => void }) { // eslint-disable-line no-unused-vars
  const reactions = message.reactions || []
  if (!reactions.length && !onCheer) return null
  if (!reactions.length) return <button type="button" onClick={() => onCheer?.(message)} aria-label="Cheer" title="Cheer"
    className="mt-0.5 hidden h-6 items-center rounded-full px-2 text-xs text-muted-foreground hover:bg-muted group-hover/message:flex group-focus-within/message:flex">👏</button>
  return <span className="mt-1 flex gap-1 px-1">{reactions.map((reaction) => <button key={reaction.emoji} type="button" disabled={!onCheer} aria-pressed={reaction.mine}
    onClick={() => onCheer?.(message)} aria-label={`${reaction.emoji} ${reaction.count}${reaction.mine ? ', including you' : ''}`}
    className={cn('flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-semibold', reaction.mine ? 'border-[var(--org-primary-color)] bg-[color-mix(in_srgb,var(--org-primary-color)_12%,transparent)]' : 'border-border')}>
    <span aria-hidden="true">{reaction.emoji}</span>{reaction.count}
  </button>)}</span>
}
