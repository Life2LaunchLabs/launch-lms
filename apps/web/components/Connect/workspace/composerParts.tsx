'use client'

import React from 'react'
import { Building2, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import type { ChatTopic, FoundPerson, TopicStep } from '@services/connect/connect'
import type { PersonSummary } from '@services/goals/types'
import { StepMark, orgToken, planToken, stepToken, userToken } from './tags'

export type TagOrg = { org_uuid: string; name: string }

export type Option =
  | { type: 'plan'; plan: ChatTopic; outside?: boolean; whole?: boolean }
  | { type: 'step'; plan: ChatTopic; step: TopicStep; outside?: boolean }
  | { type: 'person'; person: PersonSummary }
  | { type: 'org'; org: TagOrg }

/** A tag being typed: / for a plan and then one of its steps, or @ for a person or organization. */
export type Draft = { el: HTMLSpanElement; char: '/' | '@'; stage: 'plan' | 'step' | 'person'; plan?: ChatTopic; outside?: boolean; query: string }

export const ZWSP = '\u200b'
const STATUS: Record<string, string> = { completed: 'Done', excused: 'Excused', submitted: 'Waiting on review', changes_requested: 'Changes asked for', in_progress: 'Started', not_started: 'Not started' }

export const PLAN_CHIP = 'mx-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card py-px pl-1 pr-1.5 align-baseline text-[0.92em] font-semibold leading-snug'
const PILL = 'mx-0.5 inline-flex items-center whitespace-nowrap rounded-full px-2 py-px align-baseline text-[0.92em] font-bold leading-snug'
const PERSON_PILL = 'bg-[var(--org-primary-color)]/10 text-[var(--org-primary-color)]'
const ORG_PILL = 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'

function el(tag: string, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

const flag = () => el('span', 'relative top-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] bg-[var(--org-primary-color)] text-[8px] text-white', '⚑')

/** A finished tag, as it sits in the message and goes out as a token. */
export function chipFor(option: Option): HTMLElement {
  const span = document.createElement('span')
  span.contentEditable = 'false'
  span.dataset.kind = option.type
  if (option.type === 'plan' || option.type === 'step') {
    span.dataset.goal = option.plan.goal_uuid
    span.dataset.token = option.type === 'plan' ? planToken(option.plan.goal_uuid) : stepToken(option.plan.goal_uuid, option.step.step_uuid)
    span.className = PLAN_CHIP
    span.append(flag())
    if (option.type === 'step') span.append(el('span', 'font-medium text-muted-foreground', `${option.plan.title} ›`))
    span.append(document.createTextNode(option.type === 'step' ? option.step.title : option.plan.title))
    return span
  }
  const org = option.type === 'org'
  span.dataset.token = org ? orgToken(option.org.org_uuid) : userToken(option.person.user_uuid || '')
  span.className = cn(PILL, org ? ORG_PILL : PERSON_PILL)
  span.textContent = `@${org ? option.org.name : option.person.name}`
  return span
}

/** The rest of the top suggestion, muted, after what's been typed: the autofill. */
export function ghostFor(query: string, option?: Option) {
  if (!query || !option) return ''
  const text = label(option)
  return text.toLowerCase().startsWith(query.toLowerCase()) ? text.slice(query.length) : ` → ${text}`
}

/** Draw the tag being typed, with the plan it's in, what's typed so far, the autofill and a caret. */
export function paintDraft(draft: Draft, ghost: string) {
  const { el: chip, char, stage, plan, query } = draft
  chip.className = char === '/' ? PLAN_CHIP : cn(PILL, PERSON_PILL)
  chip.replaceChildren()
  if (char === '/') {
    chip.append(flag())
    if (stage === 'step' && plan) chip.append(el('span', 'font-medium text-muted-foreground', `${plan.title} ›`))
  } else chip.append(document.createTextNode('@'))
  if (query) chip.append(document.createTextNode(query))
  chip.append(el('span', 'mx-px inline-block h-[1.05em] w-px animate-pulse bg-current align-middle'))
  if (ghost) chip.append(el('span', 'font-medium opacity-45', ghost))
}

/** What a draft can become, best first. */
export function optionsFor(draft: Draft | null, topics: ChatTopic[], mine: ChatTopic[], people: PersonSummary[], orgs: TagOrg[], found: FoundPerson[]): Option[] {
  if (!draft) return []
  const needle = draft.query.toLowerCase()
  const has = (text: string) => text.toLowerCase().includes(needle)
  const first = (text: string) => text.toLowerCase().startsWith(needle)
  // eslint-disable-next-line no-unused-vars
  const rank = <T,>(items: T[], name: (item: T) => string) => [...items.filter((item) => first(name(item))), ...items.filter((item) => !first(name(item)) && has(name(item)))]
  if (draft.stage === 'person') {
    const known = new Set(people.map((person) => person.user_uuid))
    const here: Option[] = [...orgs.map((org) => ({ type: 'org' as const, org })), ...people.map((person) => ({ type: 'person' as const, person }))]
    const name = (option: Option) => option.type === 'person' ? `${option.person.name} ${option.person.username}` : label(option)
    return [
      ...rank(here, name),
      ...found.filter((person) => !known.has(person.user_uuid)).map((person) => ({ type: 'person' as const, person })),
    ].slice(0, 8)
  }
  if (draft.stage === 'step' && draft.plan) {
    const plan = draft.plan
    const whole = { type: 'plan' as const, plan, outside: draft.outside, whole: true }
    const steps = rank(plan.steps, (step) => step.title).map((step) => ({ type: 'step' as const, plan, step, outside: draft.outside }))
    // The whole plan leads until you start typing; then the steps you're narrowing to do.
    return (needle ? [...steps, whole] : [whole, ...steps]).slice(0, 12)
  }
  const here = new Set(topics.map((plan) => plan.goal_uuid))
  return [
    ...rank(topics, (plan) => plan.title).map((plan) => ({ type: 'plan' as const, plan })),
    ...rank(mine.filter((plan) => !here.has(plan.goal_uuid)), (plan) => plan.title).map((plan) => ({ type: 'plan' as const, plan, outside: true })),
  ].slice(0, 12)
}

export function OptionIcon({ option }: { option: Option }) {
  if (option.type === 'person') return <PersonAvatar user={option.person as any} size="sm" />
  if (option.type === 'org') return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white"><Building2 size={14} /></span>
  if (option.type === 'plan') return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--org-primary-color)] text-white"><Flag size={14} /></span>
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center"><StepMark status={option.step.status} behind={option.step.behind} className="h-4 w-4" /></span>
}

export function label(option: Option) {
  if (option.type === 'person') return option.person.name
  if (option.type === 'org') return option.org.name
  if (option.type === 'plan') return option.plan.title
  return option.step.title
}

export function detail(option: Option) {
  if (option.type === 'person') return `@${option.person.username}`
  if (option.type === 'org') return 'Organization'
  const where = option.outside ? ` · ${option.plan.org_name || 'Personal'}, from outside this chat` : ''
  if (option.type === 'plan') return option.whole ? 'The whole plan' : `${option.plan.progress.done} of ${option.plan.progress.total} done${where}`
  return `${STATUS[option.step.status] || 'Not started'}${option.step.behind ? ', behind' : ''}`
}
