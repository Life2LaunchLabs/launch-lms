'use client'

import React from 'react'
import useSWR from 'swr'
import { AtSign, Building2, Flag, Loader2, Plus, Send, Slash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { connectApi, connectUrl, type ChatTopic, type FoundPerson, type TopicStep } from '@services/connect/connect'
import type { PersonSummary } from '@services/goals/types'
import { StepMark, orgToken, planToken, stepToken, userToken } from './tags'

export type TagOrg = { org_uuid: string; name: string }

type Option =
  | { type: 'plan'; plan: ChatTopic }
  | { type: 'step'; plan: ChatTopic; step: TopicStep }
  | { type: 'person'; person: PersonSummary }
  | { type: 'org'; org: TagOrg }

type Trigger = { node: Text; start: number; end: number; char: '/' | '@'; query: string; afterPlan: HTMLElement | null }

const ZWSP = '\u200b'
const STATUS: Record<string, string> = { completed: 'Done', excused: 'Excused', submitted: 'Waiting on review', changes_requested: 'Changes asked for', in_progress: 'Started', not_started: 'Not started' }

export type TagComposerHandle = {
  /** Start the message with a tag, such as the step being looked at. Only while it's empty. */
  // eslint-disable-next-line no-unused-vars
  prefill: (option: { plan: ChatTopic; step?: TopicStep } | null) => void
  focus: () => void
}

/**
 * Coach's composer for people: type / for a plan and / again for one of its steps, @ for a
 * person or an organization, or use +. Tags sit inline as chips and go out as tokens.
 */
const TagComposer = React.forwardRef<TagComposerHandle, {
  topics: ChatTopic[]
  people: PersonSummary[]
  orgs: TagOrg[]
  placeholder: string
  disabled?: string
  token?: string
  /** The plan being looked at: / offers its steps first. */
  scopeGoal?: string
  // eslint-disable-next-line no-unused-vars
  onSend: (body: string) => Promise<boolean>
}>(function TagComposer({ topics, people, orgs, placeholder, disabled, token, scopeGoal, onSend }, ref) {
  const editor = React.useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = React.useState(true)
  const prefilled = React.useRef<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const [trigger, setTrigger] = React.useState<Trigger | null>(null)
  const [active, setActive] = React.useState(0)
  const query = trigger?.char === '@' ? trigger.query : ''
  const { data: found = [] } = useSWR<FoundPerson[]>(token && query.length >= 2 ? connectUrl(`/search?q=${encodeURIComponent(query)}`) : null, () => connectApi.search(query, token), { keepPreviousData: true })

  const options = React.useMemo<Option[]>(() => {
    if (!trigger) return []
    const needle = trigger.query.toLowerCase()
    const has = (text: string) => text.toLowerCase().includes(needle)
    if (trigger.char === '@') {
      const known = new Set(people.map((person) => person.user_uuid))
      return [
        ...orgs.filter((org) => has(org.name)).map((org) => ({ type: 'org' as const, org })),
        ...people.filter((person) => has(person.name) || has(person.username)).map((person) => ({ type: 'person' as const, person })),
        ...found.filter((person) => !known.has(person.user_uuid)).map((person) => ({ type: 'person' as const, person })),
      ].slice(0, 8)
    }
    const planOf = trigger.afterPlan ? topics.find((plan) => plan.goal_uuid === trigger.afterPlan?.dataset.goal) : null
    if (planOf) return planOf.steps.filter((step) => has(step.title)).map((step) => ({ type: 'step' as const, plan: planOf, step }))
    const scoped = scopeGoal ? topics.find((plan) => plan.goal_uuid === scopeGoal) : null
    const plans = topics.filter((plan) => has(plan.title)).map((plan) => ({ type: 'plan' as const, plan }))
    return scoped ? [...scoped.steps.filter((step) => has(step.title)).map((step) => ({ type: 'step' as const, plan: scoped, step })), ...plans].slice(0, 12) : plans
  }, [trigger, topics, people, orgs, found, scopeGoal])

  const sync = () => {
    const node = editor.current
    setEmpty(!node || (!node.textContent?.replace(new RegExp(ZWSP, 'g'), '').trim() && !node.querySelector('[data-token]')))
  }

  const caret = (): Trigger | null => {
    const selection = window.getSelection()
    const node = selection?.anchorNode
    if (!selection?.rangeCount || !node || node.nodeType !== Node.TEXT_NODE || !editor.current?.contains(node)) return null
    const before = (node.textContent || '').slice(0, selection.anchorOffset)
    const match = before.match(/(^|[\s\u00a0\u200b])([@/])([^\s\u00a0\u200b@/]*)$/)
    if (!match) return null
    const start = selection.anchorOffset - match[2].length - match[3].length
    // "/" right after a plan's chip narrows to that plan's steps.
    const previous = node.previousSibling as HTMLElement | null
    const afterPlan = match[2] === '/' && /^[\s\u00a0\u200b]*$/.test(before.slice(0, start)) && previous?.dataset?.kind === 'plan' ? previous : null
    return { node: node as Text, start, end: selection.anchorOffset, char: match[2] as '/' | '@', query: match[3], afterPlan }
  }

  const chipFor = (option: Option): HTMLElement => {
    const span = document.createElement('span')
    span.contentEditable = 'false'
    if (option.type === 'plan' || option.type === 'step') {
      span.dataset.kind = option.type
      span.dataset.goal = option.plan.goal_uuid
      span.dataset.token = option.type === 'plan' ? planToken(option.plan.goal_uuid) : stepToken(option.plan.goal_uuid, option.step.step_uuid)
      span.className = 'mx-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card py-px pl-1 pr-1.5 align-baseline text-[0.92em] font-semibold leading-snug'
      const mark = document.createElement('span')
      mark.className = 'relative top-px flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-[var(--org-primary-color)] text-[8px] text-white'
      mark.textContent = '⚑'
      span.append(mark)
      if (option.type === 'step') {
        const crumb = document.createElement('span')
        crumb.className = 'font-medium text-muted-foreground'
        crumb.textContent = `${option.plan.title} ›`
        span.append(crumb)
      }
      span.append(document.createTextNode(option.type === 'step' ? option.step.title : option.plan.title))
    } else {
      const org = option.type === 'org'
      span.dataset.kind = option.type
      span.dataset.token = org ? orgToken(option.org.org_uuid) : userToken(option.person.user_uuid || '')
      span.className = cn('mx-0.5 inline-flex items-center whitespace-nowrap rounded-full px-2 py-px align-baseline text-[0.92em] font-bold leading-snug',
        org ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' : 'bg-[var(--org-primary-color)]/10 text-[var(--org-primary-color)]')
      span.textContent = `@${org ? option.org.name : option.person.name}`
    }
    return span
  }

  const place = (node: Node, offset: number) => {
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const pick = (option: Option | undefined) => {
    if (!option || !trigger) return
    const { node, start, end, afterPlan } = trigger
    const chip = chipFor(option)
    const rest = node.splitText(start)
    rest.textContent = (rest.textContent || '').slice(end - start)
    if (afterPlan && option.type === 'step') afterPlan.replaceWith(chip)
    else node.parentNode?.insertBefore(chip, rest)
    // After a plan the caret waits right beside it, so another / picks one of its steps.
    const after = document.createTextNode(option.type === 'plan' ? ZWSP : '\u00a0')
    chip.after(after)
    place(after, after.length)
    setTrigger(null)
    sync()
  }

  const serialize = () => {
    let text = ''
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) { text += (node.textContent || '').replace(new RegExp(ZWSP, 'g'), '').replace(/\u00a0/g, ' '); return }
      const element = node as HTMLElement
      if (element.dataset?.token) { text += element.dataset.token; return }
      if (element.tagName === 'BR') { text += '\n'; return }
      if (element.tagName === 'DIV' && text && !text.endsWith('\n')) text += '\n'
      element.childNodes.forEach(walk)
    }
    editor.current?.childNodes.forEach(walk)
    return text.trim()
  }

  const send = async () => {
    const body = serialize()
    if (!body || sending || disabled) return
    setSending(true)
    try {
      if (await onSend(body) && editor.current) {
        editor.current.innerHTML = ''
        sync()
      }
    } finally {
      setSending(false)
    }
  }

  const begin = (char: '/' | '@') => {
    const node = editor.current
    if (!node) return
    node.focus()
    const selection = window.getSelection()
    if (!selection?.rangeCount || !node.contains(selection.anchorNode)) place(node, node.childNodes.length)
    const text = node.textContent || ''
    document.execCommand('insertText', false, `${text && !/[\s\u00a0\u200b]$/.test(text) ? ' ' : ''}${char}`)
  }

  React.useImperativeHandle(ref, () => ({
    focus: () => editor.current?.focus(),
    prefill: (target) => {
      const node = editor.current
      // Only swap out the tag this put here: anything the person typed stays.
      const current = serialize().trim()
      if (!node || (current && current !== prefilled.current)) return
      node.innerHTML = ''
      if (target) {
        const chip = chipFor(target.step ? { type: 'step', plan: target.plan, step: target.step } : { type: 'plan', plan: target.plan })
        node.append(chip, document.createTextNode('\u00a0'))
      }
      prefilled.current = serialize().trim() || null
      sync()
    },
  }))

  return <div className="relative">
    {trigger ? <div role="listbox" aria-label={trigger.char === '@' ? 'People and organizations' : 'Plans and steps'}
      className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-[min(22rem,100%)] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-xl">
      <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {trigger.char === '@' ? 'People and organizations' : trigger.afterPlan ? `Steps in ${topics.find((plan) => plan.goal_uuid === trigger.afterPlan?.dataset.goal)?.title || 'this plan'}` : 'Plans and steps'}
      </p>
      {options.length ? options.map((option, index) => <button key={index} type="button" role="option" aria-selected={index === active}
        onMouseDown={(event) => { event.preventDefault(); pick(option) }} onMouseEnter={() => setActive(index)}
        className={cn('flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left', index === active && 'bg-muted')}>
        <OptionIcon option={option} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{label(option)}</span>
          <span className="block truncate text-xs text-muted-foreground">{detail(option)}</span>
        </span>
      </button>) : <p className="px-2 py-2 text-sm text-muted-foreground">{trigger.char === '@' ? 'No one by that name' : topics.length ? 'Nothing matches' : 'No plans in this chat yet'}</p>}
    </div> : null}
    <div className="hub-composer-shell rounded-[1.4rem] p-2">
      <div className="relative">
        {empty ? <span aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 text-base leading-6 text-muted-foreground">{disabled || placeholder}</span> : null}
        <div ref={editor} role="textbox" aria-multiline="true" aria-label="Message" contentEditable={!disabled && !sending} suppressContentEditableWarning
          className="max-h-48 min-h-11 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-base leading-6 outline-none"
          onInput={() => { sync(); const next = caret(); setTrigger(next); setActive(0) }}
          onKeyUp={(event) => { if (event.key.startsWith('Arrow') && !trigger) return; if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) setTrigger(caret()) }}
          onBlur={() => setTimeout(() => setTrigger(null), 120)}
          onPaste={(event) => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')) }}
          onKeyDown={(event) => {
            if (trigger && options.length) {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive((active + 1) % options.length); return }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive((active - 1 + options.length) % options.length); return }
              if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); pick(options[active]); return }
            }
            if (event.key === 'Escape') { setTrigger(null); return }
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
          }} />
      </div>
      <div className="flex h-9 items-center justify-between gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" disabled={Boolean(disabled)} aria-label="Tag a plan, step, person or organization"><Plus className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-60" onCloseAutoFocus={(event) => event.preventDefault()}>
            <DropdownMenuItem onSelect={() => setTimeout(() => begin('/'), 0)}><Slash /> Tag a plan or step</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeout(() => begin('@'), 0)}><AtSign /> Tag a person or organization</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block"><b className="font-semibold">/</b> plans and steps · <b className="font-semibold">@</b> people</span>
        <Button type="button" size="icon" className="h-9 w-9 rounded-xl" disabled={empty || sending || Boolean(disabled)} aria-label="Send message" onClick={() => void send()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  </div>
})

export default TagComposer

function OptionIcon({ option }: { option: Option }) {
  if (option.type === 'person') return <PersonAvatar user={option.person as any} size="sm" />
  if (option.type === 'org') return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white"><Building2 size={14} /></span>
  if (option.type === 'plan') return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--org-primary-color)] text-white"><Flag size={14} /></span>
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center"><StepMark status={option.step.status} behind={option.step.behind} className="h-4 w-4" /></span>
}

function label(option: Option) {
  if (option.type === 'person') return option.person.name
  if (option.type === 'org') return option.org.name
  if (option.type === 'plan') return option.plan.title
  return option.step.title
}

function detail(option: Option) {
  if (option.type === 'person') return `@${option.person.username}`
  if (option.type === 'org') return 'Organization'
  if (option.type === 'plan') return `${option.plan.progress.done} of ${option.plan.progress.total} done · type / again for a step`
  return `${STATUS[option.step.status] || 'Not started'}${option.step.behind ? ', behind' : ''} · ${option.plan.title}`
}
