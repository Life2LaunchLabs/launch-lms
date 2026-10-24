'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowUpRight, ChevronRight, Lock, MessageCircle, MessageSquarePlus, MoreHorizontal, Users, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useHub } from '@components/Hub/HubContext'
import ChatWorkspace, { type ChatSource } from '@components/Connect/workspace/ChatWorkspace'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type ChatAudience, type ChatTopic, type CohortChat, type GoalChat as GoalChatData } from '@services/connect/connect'
import { can, type Goal, type Step } from '@services/goals/types'
import './side-chat.css'

/** What a plan's chat is about: one learner's goal, or an assignment's plan with its staff or its whole group. */
export type GoalChatScope =
  | { goal: Goal | null }
  | { assignment: { orgId: number; assignment_uuid: string; title: string }; audience: ChatAudience }

type CohortScope = Extract<GoalChatScope, { audience: ChatAudience }>

/** How much has been said about the plan and each of its steps, for its chat buttons. */
type ChatButtons = Pick<GoalChatData, 'title' | 'can_post' | 'counts' | 'count'>

type GoalChatValue = {
  chat: ChatButtons
  /** Open the plan's chat beside it, filtered to one step or (null) the whole plan. */
  // eslint-disable-next-line no-unused-vars
  open: (stepUuid: string | null) => void
}

/** A scope's chat once it has loaded: where its messages come from, and what its filter narrows. */
type ScopeChat = {
  key: string
  chat: ChatButtons
  source: ChatSource
  /** What the chat is about, for the panel's label. */
  about: string
  /** The plan the filter starts on. */
  topicUuid: string
  /** A cohort's chat filters by its template's steps instead of the chat's own plans. */
  steps?: ChatTopic
  elsewhere: { href: string; label: string } | null
  /** Staff reading a learner's plan feed also keep notes about the learner there. */
}

type OpenPlan = (goalUuid: string, stepUuid?: string) => void // eslint-disable-line no-unused-vars

/** An assignment's chats: Staff only, and Whole group for a group assignment. */
export type AudienceChoice = {
  options: ChatAudience[]
  onChange: (audience: ChatAudience) => void // eslint-disable-line no-unused-vars
}

const AUDIENCE_LABELS: Record<ChatAudience, { label: string; icon: React.ElementType }> = {
  staff: { label: 'Staff only', icon: Lock },
  group: { label: 'Whole group', icon: Users },
}

const GoalChatContext = React.createContext<GoalChatValue | null>(null)
export const useGoalChat = () => React.useContext(GoalChatContext)

/**
 * The open plan's chat: the same chat as in Connect, opened beside the plan and filtered to it.
 * A step's comments are that chat filtered to the step, so they read the same everywhere.
 * Staff who aren't in the learner's chat with the organization read along (staffOrgId). An
 * assignment's plan talks in a chat of its own, with its staff alone or the whole group.
 */
export function GoalChatProvider({ scope, token, orgslug, staffOrgId, audiences, onOpenPlan, onClose, children }: {
  scope: GoalChatScope
  token?: string
  orgslug: string
  staffOrgId?: number
  /** An assignment's chats to switch between in the panel, and what switching does. */
  audiences?: AudienceChoice
  /** Where a plan tagged from outside the chat opens; by default the learner's plan. */
  onOpenPlan?: OpenPlan
  /** Called when the chat panel closes. */
  onClose?: () => void
  children: React.ReactNode
}) {
  const goal = 'goal' in scope ? scope.goal : null
  const goalChat = useGoalScopeChat(goal, token, orgslug, staffOrgId)
  const cohortChat = useCohortScopeChat('goal' in scope ? null : scope, token, orgslug)
  const { ready, refresh } = 'goal' in scope ? goalChat : cohortChat
  const [target, setTarget] = React.useState<{ step: string | null } | null>(null)
  // Switching between an assignment's chats keeps the panel open on the same step.
  const scopeKey = 'goal' in scope ? goal?.goal_uuid : scope.assignment.assignment_uuid
  React.useEffect(() => setTarget(null), [scopeKey])
  const audience = 'goal' in scope ? undefined : scope.audience
  // A link can open the chat on a step: /plans/{goal}?chat={step}, or ?chat=plan for the whole plan.
  const readyKey = ready?.key
  React.useEffect(() => {
    if (!readyKey) return
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('chat')
    if (!wanted) return
    setTarget({ step: wanted === 'plan' ? null : wanted })
    params.delete('chat')
    window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}`)
  }, [readyKey])

  const value = React.useMemo<GoalChatValue | null>(() => ready ? { chat: ready.chat, open: (step) => setTarget({ step }) } : null, [ready])
  return <GoalChatContext.Provider value={value}>
    {children}
    {ready && target ? <GoalChatPanel chat={ready} stepUuid={target.step} token={token} orgslug={orgslug} onOpenPlan={onOpenPlan}
      audiences={audience && audiences && audiences.options.length > 1 ? { ...audiences, value: audience } : undefined}
      onClose={() => { setTarget(null); void refresh(); onClose?.() }} /> : null}
  </GoalChatContext.Provider>
}

/** One learner's goal: their chat with the people on it, or with the organization as its staff read along. */
function useGoalScopeChat(goal: Goal | null, token: string | undefined, orgslug: string, staffOrgId?: number) {
  const canView = Boolean(goal && can(goal, 'view_plan'))
  const { data, mutate } = useSWR<GoalChatData>(goal && token && canView ? connectKeys.goalChat(goal.goal_uuid) : null, () => connectApi.goalChat(goal!.goal_uuid, token), { refreshInterval: 15_000 })
  const ready = React.useMemo<ScopeChat | null>(() => {
    if (!goal || !data || data.goal_uuid !== goal.goal_uuid) return null
    const subject = goal.subject
    const source: ChatSource | null = data.conversation_uuid ? { chatUuid: data.conversation_uuid }
      : staffOrgId && subject?.id && goal.ownership === 'external' && data.title ? { orgId: staffOrgId, userId: subject.id } : null
    if (!source) return null
    const elsewhere = 'chatUuid' in source ? { href: getUriWithOrg(orgslug, routePaths.org.chat(source.chatUuid)), label: 'Open in Connect' }
      : subject?.username ? { href: getUriWithOrg(orgslug, routePaths.org.admin.people.user(subject.username)), label: `See ${subject.name} in People` } : null
    return { key: goal.goal_uuid, chat: data, source, about: goal.title, topicUuid: goal.goal_uuid, elsewhere }
  }, [goal, data, staffOrgId, orgslug])
  return { ready, refresh: mutate }
}

/** An assignment's chat with its staff or its whole group, filtered by its template's steps. */
function useCohortScopeChat(scope: CohortScope | null, token: string | undefined, orgslug: string) {
  const assignment = scope?.assignment
  const audience = scope?.audience
  const { data, mutate } = useSWR<CohortChat>(assignment && audience && token ? connectKeys.cohortChat(assignment.orgId, assignment.assignment_uuid, audience) : null,
    () => connectApi.cohortChat(assignment!.orgId, assignment!.assignment_uuid, audience!, token), { refreshInterval: 15_000, shouldRetryOnError: false })
  const ready = React.useMemo<ScopeChat | null>(() => {
    if (!assignment || !audience || !data?.conversation_uuid || data.assignment_uuid !== assignment.assignment_uuid || data.audience !== audience) return null
    return {
      key: `${assignment.assignment_uuid}:${audience}`, chat: data, source: { chatUuid: data.conversation_uuid, audience }, about: assignment.title,
      topicUuid: data.topic.goal_uuid, steps: data.topic, elsewhere: { href: getUriWithOrg(orgslug, routePaths.org.chat(data.conversation_uuid)), label: 'Open in Connect' },
    }
  }, [assignment, audience, data, orgslug])
  return { ready, refresh: mutate }
}

/** The plan's chat docked beside the page: Coach's panel, header and all, with the chat's name where Coach's would be. */
function GoalChatPanel({ chat, stepUuid, token, orgslug, onOpenPlan, audiences, onClose }: {
  chat: ScopeChat; stepUuid: string | null; token?: string; orgslug: string; onOpenPlan?: OpenPlan
  audiences?: AudienceChoice & { value: ChatAudience }; onClose: () => void
}) {
  const hub = useHub()
  const tuck = hub?.state === 'open' ? hub.tuck : null
  React.useEffect(() => {
    // One companion at a time: Coach steps back while the plan's chat is out.
    tuck?.()
    const shell = document.querySelector('.hub-shell')
    shell?.setAttribute('data-side-chat', '')
    return () => shell?.removeAttribute('data-side-chat')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !(event.target as HTMLElement)?.closest?.('[role="textbox"], [role="menu"]')) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  const elsewhere = chat.elsewhere
  // The learner page slides on phones (a transform), which would pin a fixed panel to the page
  // instead of the screen, so the panel lives on the shell, next to Coach's.
  const [home, setHome] = React.useState<Element | null>(null)
  React.useEffect(() => setHome(document.querySelector('.hub-shell') || document.body), [])
  if (!home) return null
  return createPortal(<aside aria-label={`${chat.chat.title || 'Chat'} about ${chat.about}`} className="side-chat-panel">
    <ChatWorkspace key={`${chat.key}:${stepUuid || ''}`} source={chat.source} orgslug={orgslug} token={token} initialFilter={{ goal_uuid: chat.topicUuid, step_uuid: stepUuid || undefined }}
      steps={chat.steps} onOpenPlan={onOpenPlan}
      header={(loaded) => <><header className="flex h-14 shrink-0 items-center gap-0.5 px-3 sm:px-4" aria-label="Chat navigation">
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={onClose} aria-label="Show the page"><ChevronRight className="h-4 w-4" /></Button>
        <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-sm font-medium" title={loaded?.people.map((person) => person.name).join(', ')}>
          <span className="truncate">{loaded?.title || chat.chat.title}</span>
        </span>
        <div className="flex-1" />
        {elsewhere ? <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Chat options"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild><Link href={elsewhere.href}><ArrowUpRight /> {elsewhere.label}</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> : null}
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Close chat"><X className="h-4 w-4" /></Button>
      </header>{audiences ? <AudienceToggle {...audiences} /> : null}</>} />
  </aside>, home)
}

/** Staff only or Whole group: which of an assignment's chats the panel shows. */
export function AudienceToggle({ options, value, onChange }: AudienceChoice & { value: ChatAudience }) {
  return <div role="radiogroup" aria-label="Who reads this chat" className="flex shrink-0 gap-1 px-3 pb-2 sm:px-4">
    {options.map((option) => {
      const { label, icon: Icon } = AUDIENCE_LABELS[option]
      const on = option === value
      return <button key={option} type="button" role="radio" aria-checked={on} onClick={() => { if (!on) onChange(option) }}
        className={cn('flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border text-xs font-bold transition-colors',
          on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
        <Icon size={13} aria-hidden="true" />{label}
      </button>
    })}
  </div>
}

/** The plan's chat on its header card, with how much has been said about it. */
export function GoalChatChip({ className }: { className: string }) {
  const chat = useGoalChat()
  if (!chat) return null
  return <button type="button" onClick={() => chat.open(null)} className={className} aria-label={chat.chat.count ? `Chat, ${chat.chat.count} messages about this goal` : 'Chat about this goal'}>
    <MessageCircle size={15} aria-hidden="true" /><span>Chat</span>{chat.chat.count ? <span className="opacity-70">{chat.chat.count}</span> : null}
  </button>
}

/**
 * A step's comments: how many messages tag it, or a quiet button to start talking about it.
 * With a label (an assignment's plan: Discuss), it always shows, named, with its count.
 */
export function StepChatButton({ step, quiet = false, label }: { step: Step; quiet?: boolean; label?: string }) {
  const chat = useGoalChat()
  if (!chat) return null
  const count = chat.chat.counts[step.step_uuid] || 0
  if (!count && !label && (quiet || !chat.chat.can_post)) return null
  const about = count ? `${count} message${count === 1 ? '' : 's'} about ${step.title}` : null
  return <button type="button" onClick={() => chat.open(step.step_uuid)} aria-label={label ? `${label} ${step.title}${about ? `, ${about}` : ''}` : about || `Comment on ${step.title}`}
    className={cn('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold transition hover:bg-muted', count ? 'text-[var(--plan-accent)]' : 'text-muted-foreground')}>
    {count ? <MessageCircle size={14} aria-hidden="true" /> : <MessageSquarePlus size={14} aria-hidden="true" />}{label ? <span>{label}</span> : null}{count ? <span className={label ? 'opacity-70' : undefined}>{count}</span> : null}
  </button>
}
