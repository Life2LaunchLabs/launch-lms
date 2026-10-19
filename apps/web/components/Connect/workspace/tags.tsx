'use client'

import React from 'react'
import { Building2, Check, Clock, Flag, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import type { MessageRef } from '@services/connect/connect'

/** Tags in message text: <plan:goal>, <step:goal/step>, <user:uuid>, <org:uuid>. */
export const TAG = /<(plan|step|user|org):([A-Za-z0-9_.-]+)(?:\/([A-Za-z0-9_.-]+))?>/g

export const planToken = (goalUuid: string) => `<plan:${goalUuid}>`
export const stepToken = (goalUuid: string, stepUuid: string) => `<step:${goalUuid}/${stepUuid}>`
export const userToken = (userUuid: string) => `<user:${userUuid}>`
export const orgToken = (orgUuid: string) => `<org:${orgUuid}>`

/** A step's state as a small mark: done, waiting on review, sent back, or not done yet. */
export function StepMark({ status, behind = false, className }: { status: string; behind?: boolean; className?: string }) {
  const base = 'flex shrink-0 items-center justify-center rounded-full'
  if (status === 'completed' || status === 'excused') return <span className={cn(base, 'bg-emerald-600 text-white', className)}><Check size={9} strokeWidth={4} /></span>
  if (status === 'submitted') return <span className={cn(base, 'border-2 border-amber-500 text-amber-600', className)}><Clock size={8} strokeWidth={3} /></span>
  if (status === 'changes_requested') return <span className={cn(base, 'border-2 border-red-500 text-red-600', className)}><RotateCcw size={8} strokeWidth={3} /></span>
  return <span className={cn(base, 'border-2', behind ? 'border-red-400' : 'border-muted-foreground/40', className)} />
}

const chip = 'mx-0.5 inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card py-px pl-1 pr-1.5 align-baseline text-[0.92em] font-semibold leading-snug text-foreground no-underline transition-colors'
const pill = 'mx-0.5 inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full py-px pl-0.5 pr-2 align-baseline text-[0.92em] font-bold leading-snug'

/** A plan or one of its steps, inline: a rounded square with the plan's flag, Confluence style. */
export function PlanTag({ title, planTitle, onClick }: { title: string; planTitle?: string; onClick?: () => void }) {
  const inner = <>
    <span className="relative top-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] bg-[var(--org-primary-color)] text-white"><Flag size={9} strokeWidth={3} /></span>
    {planTitle ? <span className="truncate font-medium text-muted-foreground">{planTitle} ›</span> : null}
    <span className="truncate">{title}</span>
  </>
  return onClick
    ? <button type="button" onClick={onClick} className={cn(chip, 'hover:border-[var(--org-primary-color)]')}>{inner}</button>
    : <span className={chip}>{inner}</span>
}

/** A person or an organization, inline: a pill with their face or the organization's mark. */
export function PersonTag({ person }: { person: { name: string; avatar_image?: string | null; user_uuid?: string } }) {
  return <span className={cn(pill, 'bg-[var(--org-primary-color)]/10 text-[var(--org-primary-color)]')}><span className="relative top-px"><PersonAvatar user={person as any} size="xs" /></span>{person.name}</span>
}

export function OrgTag({ name }: { name: string }) {
  return <span className={cn(pill, 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400')}>
    <span className="relative top-px flex h-5 w-5 items-center justify-center rounded-[6px] bg-emerald-600 text-white"><Building2 size={11} /></span>{name}
  </span>
}

/** What a tag is, by its token key, so a message can find each tag's current name. */
export const tagKey = (kind: string, first: string, second?: string) => `${kind}:${first}${second ? `/${second}` : ''}`

/** A message's text with its tags drawn inline. Tags that no longer resolve drop out. */
export function MessageText({ body, refs, links = true, inPlan, onTag }: {
  body: string
  refs: MessageRef[]
  links?: boolean
  /** The plan being looked at: its steps go without the plan's name. */
  inPlan?: string
  // eslint-disable-next-line no-unused-vars
  onTag?: (ref: MessageRef) => void
}) {
  const byKey = new Map(refs.map((ref) => [ref.key, ref]))
  const parts: React.ReactNode[] = []
  let last = 0
  for (const match of body.matchAll(TAG)) {
    const index = match.index || 0
    if (index > last) parts.push(<Linked key={`t${last}`} text={body.slice(last, index)} links={links} />)
    const ref = byKey.get(tagKey(match[1], match[2], match[3]))
    if (ref) parts.push(<Tag key={`r${index}`} tag={ref} inPlan={inPlan} onTag={onTag} />)
    last = index + match[0].length
  }
  if (last < body.length) parts.push(<Linked key={`t${last}`} text={body.slice(last)} links={links} />)
  return <>{parts}</>
}

// eslint-disable-next-line no-unused-vars
export function Tag({ tag, inPlan, onTag }: { tag: MessageRef; inPlan?: string; onTag?: (ref: MessageRef) => void }) {
  // A plan from outside the chat that isn't shared with you: it's there, but private.
  if ((tag.kind === 'plan' || tag.kind === 'step') && tag.hidden) return <PlanTag title="Private plan" />
  if (tag.kind === 'plan') return <PlanTag title={tag.title} onClick={onTag ? () => onTag(tag) : undefined} />
  if (tag.kind === 'step') return <PlanTag title={tag.title} planTitle={tag.goal_uuid === inPlan ? undefined : tag.plan_title} onClick={onTag ? () => onTag(tag) : undefined} />
  if (tag.kind === 'user') return <PersonTag person={tag} />
  return <OrgTag name={tag.name} />
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

/** Text with its links live, once both people have said yes to the chat. Until then links stay plain text. */
function Linked({ text, links }: { text: string; links: boolean }) {
  if (!links) return <>{text}</>
  return <>{text.split(URL_PATTERN).map((part, index) => index % 2
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline underline-offset-2">{part}</a>
    : <React.Fragment key={index}>{part}</React.Fragment>)}</>
}
