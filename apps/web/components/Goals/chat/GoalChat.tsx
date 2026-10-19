'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowUpRight, ChevronRight, MessageCircle, MessageSquarePlus, MoreHorizontal, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useHub } from '@components/Hub/HubContext'
import ChatWorkspace, { type ChatSource } from '@components/Connect/workspace/ChatWorkspace'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi, connectKeys, type GoalChat as GoalChatData } from '@services/connect/connect'
import { can, type Goal, type Step } from '@services/goals/types'
import './side-chat.css'

type GoalChatValue = {
  goal: Goal
  chat: GoalChatData
  /** Open the plan's chat beside it, filtered to one step or (null) the whole plan. */
  // eslint-disable-next-line no-unused-vars
  open: (stepUuid: string | null) => void
}

const GoalChatContext = React.createContext<GoalChatValue | null>(null)
export const useGoalChat = () => React.useContext(GoalChatContext)

/**
 * The open plan's chat: the same chat as in Connect, opened beside the plan and filtered to it.
 * A step's comments are that chat filtered to the step, so they read the same everywhere.
 * Staff who aren't in the learner's chat with the organization read along (staffOrgId).
 */
export function GoalChatProvider({ goal, token, orgslug, staffOrgId, children }: { goal: Goal | null; token?: string; orgslug: string; staffOrgId?: number; children: React.ReactNode }) {
  const canView = Boolean(goal && can(goal, 'view_plan'))
  const { data, mutate } = useSWR<GoalChatData>(goal && token && canView ? connectKeys.goalChat(goal.goal_uuid) : null, () => connectApi.goalChat(goal!.goal_uuid, token), { refreshInterval: 15_000 })
  const [target, setTarget] = React.useState<{ step: string | null } | null>(null)
  const goalUuid = goal?.goal_uuid
  React.useEffect(() => setTarget(null), [goalUuid])
  // A link can open the chat on a step: /plans/{goal}?chat={step}, or ?chat=plan for the whole plan.
  React.useEffect(() => {
    if (!goalUuid || !data || data.goal_uuid !== goalUuid) return
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('chat')
    if (!wanted) return
    setTarget({ step: wanted === 'plan' ? null : wanted })
    params.delete('chat')
    window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}`)
  }, [goalUuid, data])

  const subject = goal?.subject?.id
  const source: ChatSource | null = data?.conversation_uuid ? { chatUuid: data.conversation_uuid }
    : staffOrgId && subject && goal?.ownership === 'external' && data?.title ? { orgId: staffOrgId, userId: subject } : null
  const ready = Boolean(goal && data && data.goal_uuid === goal.goal_uuid && source)
  const value = React.useMemo<GoalChatValue | null>(() => ready && goal && data ? { goal, chat: data, open: (step) => setTarget({ step }) } : null, [ready, goal, data])
  return <GoalChatContext.Provider value={value}>
    {children}
    {goal && data && source && target ? <GoalChatPanel goal={goal} chat={data} source={source} stepUuid={target.step} token={token} orgslug={orgslug}
      onClose={() => { setTarget(null); void mutate() }} /> : null}
  </GoalChatContext.Provider>
}

/** The plan's chat docked beside the page: Coach's panel, header and all, with the chat's name where Coach's would be. */
function GoalChatPanel({ goal, chat, source, stepUuid, token, orgslug, onClose }: {
  goal: Goal; chat: GoalChatData; source: ChatSource; stepUuid: string | null; token?: string; orgslug: string; onClose: () => void
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
  const elsewhere = 'chatUuid' in source ? { href: getUriWithOrg(orgslug, routePaths.org.chat(source.chatUuid)), label: 'Open in Connect' }
    : goal.subject?.username ? { href: getUriWithOrg(orgslug, routePaths.org.dash.users.userPage(goal.subject.username, 'messages')), label: `All messages with ${goal.subject.name}` } : null
  // The learner page slides on phones (a transform), which would pin a fixed panel to the page
  // instead of the screen, so the panel lives on the shell, next to Coach's.
  const [home, setHome] = React.useState<Element | null>(null)
  React.useEffect(() => setHome(document.querySelector('.hub-shell') || document.body), [])
  if (!home) return null
  return createPortal(<aside aria-label={`${chat.title || 'Chat'} about ${goal.title}`} className="side-chat-panel">
    <ChatWorkspace key={`${goal.goal_uuid}:${stepUuid || ''}`} source={source} orgslug={orgslug} token={token} initialFilter={{ goal_uuid: goal.goal_uuid, step_uuid: stepUuid || undefined }}
      header={(loaded) => <header className="flex h-14 shrink-0 items-center gap-0.5 px-3 sm:px-4" aria-label="Chat navigation">
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={onClose} aria-label="Show the page"><ChevronRight className="h-4 w-4" /></Button>
        <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-sm font-medium" title={loaded?.people.map((person) => person.name).join(', ')}>
          <span className="truncate">{loaded?.title || chat.title}</span>
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
      </header>} />
  </aside>, home)
}

/** The plan's chat on its header card, with how much has been said about it. */
export function GoalChatChip({ className }: { className: string }) {
  const chat = useGoalChat()
  if (!chat) return null
  return <button type="button" onClick={() => chat.open(null)} className={className} aria-label={chat.chat.count ? `Chat, ${chat.chat.count} messages about this goal` : 'Chat about this goal'}>
    <MessageCircle size={15} aria-hidden="true" /><span>Chat</span>{chat.chat.count ? <span className="opacity-70">{chat.chat.count}</span> : null}
  </button>
}

/** A step's comments: how many messages tag it, or a quiet button to start talking about it. */
export function StepChatButton({ step, quiet = false }: { step: Step; quiet?: boolean }) {
  const chat = useGoalChat()
  if (!chat) return null
  const count = chat.chat.counts[step.step_uuid] || 0
  if (!count && (quiet || !chat.chat.can_post)) return null
  return <button type="button" onClick={() => chat.open(step.step_uuid)} aria-label={count ? `${count} message${count === 1 ? '' : 's'} about ${step.title}` : `Comment on ${step.title}`}
    className={cn('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold transition hover:bg-muted', count ? 'text-[var(--plan-accent)]' : 'text-muted-foreground')}>
    {count ? <MessageCircle size={14} aria-hidden="true" /> : <MessageSquarePlus size={14} aria-hidden="true" />}{count ? <span>{count}</span> : null}
  </button>
}
