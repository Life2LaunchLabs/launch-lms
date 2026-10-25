'use client'

import React from 'react'
import useSWR from 'swr'
import { Building2, Lock, UserPlus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import ChatWorkspace from '@components/Connect/workspace/ChatWorkspace'
import type { TimelineItem } from '@components/Connect/workspace/feed'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { reviewHref } from '@components/Goals/admin/live/ui'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type ChatFilter, type ChatMessage } from '@services/connect/connect'
import type { PersonSummary } from '@services/goals/types'
import { ROLE_LABELS } from '@services/school/people'
import { threadKeys, threadsApi, type OrgLogEntry, type PersonThread, type ThreadFilter } from '@services/school/threads'
import { shortDate } from '@services/assignments/status'
import { ContextBar, FilterChips, type StepOption } from './ContextBar'
import { AskedCard, PastDueCard, RequestCard, ReviewCard } from './ThreadCards'

/** Whose thread: a person (a learner, or someone on staff), a group, all staff, or the organization itself. */
export type ThreadTarget =
  | { kind: 'person'; userId: number; plan?: string | null; step?: string | null; /** Opened from an assignment: its plan, and a step by its template key. */ assignment?: string | null; stepKey?: string | null }
  | { kind: 'group'; groupId: number; plan?: string | null; step?: string | null }
  | { kind: 'staff_room' }
  | { kind: 'org' }

export interface ThreadViewProps {
  target: ThreadTarget
  orgId: number
  orgslug: string
  token?: string
  /** Buttons at the right of the header: full screen, close. */
  actions?: React.ReactNode
  /** Opening someone else's thread, from a face on a card. */
  onOpen?: (target: ThreadTarget) => void // eslint-disable-line no-unused-vars
  /** Opening the profile of whoever the thread is with: a person by handle, or a group. */
  onProfile?: (who: { username: string } | { groupId: number }) => void // eslint-disable-line no-unused-vars
}

const names = (people: PersonSummary[], me?: number) => {
  const list = people.map((person) => person.id === me ? 'you' : person.name.split(' ')[0])
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

function Header({ art, title, sub, actions, onProfile }: { art: React.ReactNode; title: string; sub?: string; actions?: React.ReactNode; onProfile?: () => void }) {
  const who = <>{art}<span className="min-w-0 text-left"><b className="block truncate text-base font-bold leading-tight">{title}</b>{sub ? <small className="block truncate text-[12.5px] text-muted-foreground">{sub}</small> : null}</span></>
  return <div className="flex shrink-0 items-center gap-2 px-3 pb-2.5 pt-3 sm:px-5">
    {onProfile ? <button type="button" onClick={onProfile} title="Open profile" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 -m-1 hover:bg-muted/60">{who}</button>
      : <span className="flex min-w-0 flex-1 items-center gap-2.5">{who}</span>}
    {actions ? <span className="flex shrink-0 items-center gap-1">{actions}</span> : null}
  </div>
}

const Mark = ({ icon: Icon }: { icon: React.ElementType }) => <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground"><Icon size={17} aria-hidden="true" /></span>
const Shell = ({ children }: { children: React.ReactNode }) => <div className="flex h-full min-h-0 flex-col">{children}</div>
const Loading = ({ actions }: { actions?: React.ReactNode }) => <Shell><Header art={<span className="h-9 w-9 rounded-full bg-muted" />} title="" actions={actions} /><div className="flex-1" /></Shell>

/**
 * One thread, as the Threads page and the side panel show it: who it's with, what it's about
 * (everything, a plan, one of its steps), what waits on you there, and the messages and cards.
 */
export default function ThreadView(props: ThreadViewProps) {
  const { target } = props
  if (target.kind === 'person') return <PersonThreadView key={`p:${target.userId}`} {...props} target={target} />
  if (target.kind === 'group') return <GroupThreadView key={`g:${target.groupId}`} {...props} target={target} />
  if (target.kind === 'staff_room') return <StaffRoomView {...props} />
  return <OrgThreadView {...props} />
}

/** Which plan and step the thread is on, and the filter, kept together so picking a plan clears the step. */
function useContext(plan?: string | null, step?: string | null) {
  const [focus, setFocusState] = React.useState<string | null>(plan || null)
  const [stepId, setStep] = React.useState<string | null>(step || null)
  const [filter, setFilter] = React.useState<ThreadFilter>('all')
  const setFocus = React.useCallback((value: string | null) => { setFocusState(value); setStep(null) }, [])
  return { focus, setFocus, step: stepId, setStep, filter, setFilter }
}

function PersonThreadView({ target, orgId, orgslug, token, actions, onOpen, onProfile }: ThreadViewProps & { target: Extract<ThreadTarget, { kind: 'person' }> }) {
  const context = useContext(target.plan, target.step)
  const { focus, step, filter } = context
  const { data: thread, mutate } = useSWR<PersonThread>(token ? threadKeys.person(orgId, target.userId, focus) : null,
    () => threadsApi.person(orgId, target.userId, token, focus), { keepPreviousData: true, refreshInterval: 15_000 })
  const me = (useLHSession() as any)?.data?.user?.id as number | undefined
  // Opened from an assignment: settle on the learner's plan from it, then on the step.
  const [landing, setLanding] = React.useState(Boolean(target.assignment))
  React.useEffect(() => {
    if (!landing || !thread) return
    const plan = thread.plans.find((item) => item.assignment_uuid === target.assignment)
    if (!plan?.goal_uuid) { setLanding(false); return }
    if (focus !== plan.goal_uuid) { context.setFocus(plan.goal_uuid); return }
    if (thread.focus !== plan.goal_uuid) return
    const found = target.stepKey ? thread.steps.find((item) => item.step_key === target.stepKey) : undefined
    if (found) context.setStep(found.step_uuid)
    setLanding(false)
  }, [landing, thread, focus, target.assignment, target.stepKey, context])
  const questions = React.useMemo(() => new Set((thread?.questions || []).filter((item) => !step || item.step_uuid === step).map((item) => item.message_uuid)), [thread, step])
  const onlyQuestions = React.useCallback((message: ChatMessage) => questions.has(message.message_uuid), [questions])
  const hideAll = React.useCallback(() => false, [])

  const timeline = React.useMemo<TimelineItem[]>(() => {
    if (!thread || thread.kind !== 'learner' || filter === 'staff_only' || filter === 'questions') return []
    const onStep = <T extends { step_uuid?: string | null }>(items: T[]) => step ? items.filter((item) => item.step_uuid === step) : items
    const cards: TimelineItem[] = []
    if (filter === 'all' || filter === 'past_due') cards.push(...onStep(thread.past_due).map((line) => ({ key: `due:${line.goal_uuid}:${line.step_key}`, at: `${line.due_date || ''}T23:59:00`,
      node: <PastDueCard line={line} learner={thread.person} orgId={orgId} token={token} /> })))
    if (filter === 'all' || filter === 'requests') cards.push(...(step ? [] : thread.requests).map((request) => ({ key: `ask:${request.invitation_uuid}`, at: request.creation_date,
      node: <RequestCard request={request} orgId={orgId} token={token} onDone={() => void mutate()} /> })))
    if (filter === 'review') cards.push(...onStep(thread.review).map((item) => ({ key: `review:${item.step_uuid}`, at: item.submitted_at,
      node: <ReviewCard item={item} reviewHref={item.assignment_uuid ? reviewHref({ assignment: item.assignment_uuid, stepKey: item.step_key, stepUuid: item.step_key ? null : item.step_uuid, focus: item.step_uuid })
        : routePaths.org.admin.learnerFeed(item.goal_uuid)} /> })))
    return cards
  }, [thread, filter, step, orgId, token, mutate])

  if (!thread) return <Loading actions={actions} />
  const art = <PersonAvatar user={thread.person as any} size="md" />
  const others = thread.with.filter((person) => person.id !== thread.person.id)
  const sub = thread.kind === 'staff' ? ROLE_LABELS[thread.role] : others.length ? `With ${names(others, me)}` : ROLE_LABELS[thread.role]
  const header = <Header art={art} title={thread.person.name} sub={sub} actions={actions} onProfile={onProfile ? () => onProfile({ username: thread.person.username }) : undefined} />
  if (thread.kind === 'staff' || !thread.chat_uuid) return <Shell>{header}<div className="border-b border-border" />
    {thread.chat_uuid ? <ChatWorkspace key={thread.chat_uuid} source={{ chatUuid: thread.chat_uuid }} orgslug={orgslug} token={token} hideTopics empty="Nothing here yet. Say hello." />
      : <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">You can’t message {thread.person.name.split(' ')[0]} directly.</p>}
  </Shell>

  const steps: StepOption[] = thread.steps.map((item) => ({ id: item.step_uuid, title: item.title, updates: item.updates, done: ['done', 'approved', 'excused'].includes(item.state) }))
  const shown: ChatFilter = { goal_uuid: focus || undefined, step_uuid: focus && step ? step : undefined }
  const pick = (next: ChatFilter) => { if (next.goal_uuid !== focus) context.setFocus(next.goal_uuid || null); if (next.goal_uuid) context.setStep(next.step_uuid || null) }
  return <Shell>
    {header}
    <ContextBar plans={thread.plans} focus={focus} onFocus={context.setFocus} steps={steps} step={step} onStep={context.setStep} />
    <FilterChips counts={thread.counts} value={filter} onChange={context.setFilter} />
    {thread.counts && !Object.values(thread.counts).some(Boolean) && filter === 'all' ? <div className="border-b border-border" /> : null}
    <ChatWorkspace key={thread.chat_uuid} source={{ orgId, userId: target.userId }} orgslug={orgslug} token={token} hideTopics filter={shown} onFilter={pick} title={thread.person.name.split(' ')[0]}
      audience={filter === 'staff_only' ? 'staff' : undefined}
      only={filter === 'questions' ? onlyQuestions : filter === 'review' || filter === 'requests' || filter === 'past_due' ? hideAll : undefined}
      timeline={timeline} timelineFiltered
      stepHref={(goalUuid, stepUuid) => `${getUriWithOrg(orgslug, routePaths.org.admin.livePlan(goalUuid))}?step=${encodeURIComponent(stepUuid)}`}
      empty={filter === 'all' ? `Nothing here yet. Say hello to ${thread.person.name.split(' ')[0]}.` : 'Nothing left here. Nice.'}
      onOpenPlan={(goalUuid) => onOpen?.({ kind: 'person', userId: target.userId, plan: goalUuid })} />
  </Shell>
}

function GroupThreadView({ target, orgId, orgslug, token, actions, onOpen, onProfile }: ThreadViewProps & { target: Extract<ThreadTarget, { kind: 'group' }> }) {
  const context = useContext(target.plan, target.step)
  const { focus, step, filter } = context
  const { data: thread } = useSWR(token ? threadKeys.group(orgId, target.groupId, focus) : null,
    () => threadsApi.group(orgId, target.groupId, token, focus), { keepPreviousData: true, refreshInterval: 15_000 })
  // An assignment's own chat with the whole group, with its template's steps to filter by.
  const { data: cohort } = useSWR(token && focus ? connectKeys.cohortChat(orgId, focus, 'group') : null, () => connectApi.cohortChat(orgId, focus as string, 'group', token))
  const me = (useLHSession() as any)?.data?.user?.id as number | undefined
  const openPerson = React.useCallback((person: PersonSummary) => onOpen?.({ kind: 'person', userId: person.id, plan: null }), [onOpen])
  const hideAll = React.useCallback(() => false, [])

  const timeline = React.useMemo<TimelineItem[]>(() => {
    if (!thread || filter === 'staff_only') return []
    const cards: TimelineItem[] = []
    if (filter === 'all' || filter === 'past_due') cards.push(...thread.past_due.filter((line) => !step || line.step_key === step).map((line) => ({ key: `due:${line.assignment_uuid}:${line.step_key}`,
      at: `${line.due_date || ''}T23:59:00`, node: <PastDueCard line={line} orgId={orgId} token={token} onPerson={openPerson} /> })))
    return cards
  }, [thread, filter, step, orgId, token, openPerson])

  if (!thread) return <Loading actions={actions} />
  const sub = `${thread.group.learner_count} learner${thread.group.learner_count === 1 ? '' : 's'}${thread.with.length ? ` · with ${names(thread.with, me)}` : ''}`
  const steps: StepOption[] = (cohort?.topic.steps || []).map((item) => ({ id: item.step_uuid, title: item.title, updates: cohort?.counts[item.step_uuid] }))
  const asked = (thread.asked || []).filter((item) => !step || item.step_key === step)
  const chatUuid = focus ? cohort?.conversation_uuid : thread.chat_uuid
  return <Shell>
    <Header art={<Mark icon={Users} />} title={thread.group.name} sub={sub} actions={actions} onProfile={onProfile ? () => onProfile({ groupId: thread.group.id }) : undefined} />
    <ContextBar plans={thread.plans} focus={focus} onFocus={context.setFocus} steps={steps} step={step} onStep={context.setStep} />
    <FilterChips counts={thread.counts} value={filter} onChange={context.setFilter} />
    {chatUuid ? <ChatWorkspace key={chatUuid} source={{ chatUuid, audience: focus ? 'group' : undefined }} orgslug={orgslug} token={token} hideTopics
      filter={focus ? { goal_uuid: focus, step_uuid: step || undefined } : {}} onFilter={(next) => context.setStep(next.step_uuid || null)}
      steps={cohort?.topic} audience={filter === 'staff_only' ? 'staff' : undefined}
      only={filter === 'past_due' || filter === 'questions' ? hideAll : undefined} timeline={timeline} timelineFiltered
      footer={asked.length && (filter === 'all' || filter === 'questions') ? <div className="mx-auto mb-4 flex w-full max-w-[46rem] flex-col gap-2">{asked.map((item) => <AskedCard key={item.step_key || item.title} item={item} onPerson={openPerson} />)}</div> : null}
      empty={filter === 'all' ? 'Nothing here yet. Say hello to the group.' : 'Nothing left here. Nice.'} />
      : <><div className="border-b border-border" /><div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col gap-2 overflow-y-auto p-4">
        {timeline.map((item) => <div key={item.key}>{item.node}</div>)}
        <p className="mx-auto max-w-sm pt-10 text-center text-sm text-muted-foreground">{focus ? '' : thread.chat_note || ''}</p>
      </div></>}
  </Shell>
}

function StaffRoomView({ orgId, orgslug, token, actions }: ThreadViewProps) {
  const { data: room } = useSWR(token ? threadKeys.staffRoom(orgId) : null, () => threadsApi.staffRoom(orgId, token))
  if (!room) return <Loading actions={actions} />
  return <Shell>
    <Header art={<Mark icon={Users} />} title={room.title} sub={`${room.with.length} on staff`} actions={actions} />
    <div className="border-b border-border" />
    <ChatWorkspace key={room.chat_uuid} source={{ chatUuid: room.chat_uuid }} orgslug={orgslug} token={token} hideTopics empty="Everyone on staff reads this. Say hello." />
  </Shell>
}

function logLine(entry: OrgLogEntry) {
  if (entry.kind === 'org_created') return { icon: Building2, text: <>{entry.org.name} was created</> }
  if (entry.kind === 'staff_joined') return { icon: UserPlus, text: <><b>{entry.person?.name || 'Someone'}</b> joined as {entry.role}</> }
  if (entry.kind === 'learners_joined') return { icon: Users, text: <><b>{entry.count} learner{entry.count === 1 ? '' : 's'}</b> joined{entry.people.length ? `: ${entry.people.map((person) => person.name.split(' ')[0]).join(', ')}${entry.count > entry.people.length ? ' and others' : ''}` : ''}</> }
  return { icon: UserPlus, text: <><b>{entry.by?.name || 'Someone'}</b> invited {entry.count} {entry.role}{entry.count === 1 || entry.role === 'staff' ? '' : 's'}{entry.pending ? ` · ${entry.pending} haven’t answered yet` : ''}</> }
}

function OrgThreadView({ orgId, token, actions }: ThreadViewProps) {
  const { data: thread } = useSWR(token ? threadKeys.org(orgId) : null, () => threadsApi.org(orgId, token))
  const scroller = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }) }, [thread?.entries.length])
  if (!thread) return <Loading actions={actions} />
  return <Shell>
    <Header art={<Mark icon={Building2} />} title={thread.org.name} sub="What changed in your organization" actions={actions} />
    <div className="border-b border-border" />
    <div ref={scroller} className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
      <ol className="mx-auto flex w-full max-w-[46rem] flex-col gap-1">
        {thread.entries.map((entry, index) => {
          const { icon: Icon, text } = logLine(entry)
          return <li key={`${entry.kind}:${entry.at}:${index}`} className={cn('flex items-center gap-3 rounded-xl px-2 py-2 text-[13.5px]')}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Icon size={14} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">{text}</span>
            <time className="shrink-0 text-xs text-muted-foreground">{shortDate(entry.at)}</time>
          </li>
        })}
      </ol>
    </div>
    <p className="mx-auto mb-4 flex w-full max-w-[46rem] items-center gap-2 px-4 text-xs font-semibold text-muted-foreground"><Lock size={12} aria-hidden="true" />The organization’s own thread: nothing to reply to.</p>
  </Shell>
}
