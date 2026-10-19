'use client'

import React from 'react'
import useSWR from 'swr'
import { AtSign, Loader2, Plus, Send, Slash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { connectApi, connectKeys, connectUrl, type ChatTopic, type FoundPerson } from '@services/connect/connect'
import type { PersonSummary } from '@services/goals/types'
import { OptionIcon, ZWSP, chipFor, detail, ghostFor, label, optionsFor, paintDraft, type Draft, type Option, type TagOrg } from './composerParts'

export type { TagOrg }

export type TagComposerHandle = {
  focus: () => void
  clear: () => void
}

const SPACE = /[\s\u00a0\u200b]/

/**
 * Coach's composer for people. Typing / makes a plan tag right away and fills in the best match
 * as you type; picking a plan keeps the tag open with › for one of its steps (Tab, or space after
 * the ›, keeps the whole plan). @ and a letter does the same for people and organizations. The + button
 * starts either. Tags sit inline as chips and go out as tokens.
 */
const TagComposer = React.forwardRef<TagComposerHandle, {
  topics: ChatTopic[]
  people: PersonSummary[]
  orgs: TagOrg[]
  placeholder: string
  disabled?: string
  token?: string
  // eslint-disable-next-line no-unused-vars
  onSend: (body: string) => Promise<boolean>
}>(function TagComposer({ topics, people, orgs, placeholder, disabled, token, onSend }, ref) {
  const editor = React.useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = React.useState(true)
  const [sending, setSending] = React.useState(false)
  const [draft, setDraftState] = React.useState<Draft | null>(null)
  const current = React.useRef<Draft | null>(null)
  const [active, setActive] = React.useState(0)
  const setDraft = (next: Draft | null) => { current.current = next; setDraftState(next); setActive(0) }
  const query = draft?.stage === 'person' ? draft.query : ''
  const { data: found = [] } = useSWR<FoundPerson[]>(token && query.length >= 2 ? connectUrl(`/search?q=${encodeURIComponent(query)}`) : null, () => connectApi.search(query, token), { keepPreviousData: true })
  // Your plans from elsewhere, to point to from this chat.
  const { data: mine = [] } = useSWR<ChatTopic[]>(token ? connectKeys.plans() : null, () => connectApi.plans(token), { revalidateOnFocus: false })
  const options = React.useMemo(() => optionsFor(draft, topics, mine, people, orgs, found), [draft, topics, mine, people, orgs, found])
  const top = options[Math.min(active, options.length - 1)]
  React.useEffect(() => { if (draft) paintDraft(draft, ghostFor(draft.query, top)) }, [draft, top])

  const sync = () => {
    const node = editor.current
    setEmpty(!node || (!node.textContent?.replace(new RegExp(ZWSP, 'g'), '').trim() && !node.querySelector('[data-token],[data-draft]')))
  }

  const place = (node: Node, offset: number) => {
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  /** Open a tag at the caret, taking out the characters that started it. */
  const open = (char: '/' | '@', typed: string, node: Text, start: number, end: number) => {
    const text = node.textContent || ''
    node.textContent = text.slice(0, start) + text.slice(end)
    const after = node.splitText(start)
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.draft = 'true'
    node.parentNode?.insertBefore(chip, after)
    if (!after.textContent) after.textContent = ZWSP
    place(after, after.textContent.startsWith(ZWSP) ? 1 : 0)
    setDraft({ el: chip, char, stage: char === '@' ? 'person' : 'plan', query: typed })
    sync()
  }

  /** Close the open tag as a finished chip, or put back what was typed as plain text. */
  const close = (option: Option | null) => {
    const tag = current.current
    if (!tag) return
    const next: Node = option ? chipFor(option) : document.createTextNode(`${tag.char}${tag.query}`)
    tag.el.replaceWith(next)
    let after = next.nextSibling
    if (option) {
      const spacer = document.createTextNode('\u00a0')
      next.parentNode?.insertBefore(spacer, after)
      after = spacer
      place(spacer, 1)
    } else if (after && after.nodeType === Node.TEXT_NODE) place(after, (after.textContent || '').startsWith(ZWSP) ? 1 : 0)
    else place(next, (next.textContent || '').length)
    setDraft(null)
    sync()
  }

  const wholePlan = (tag: Draft): Option | null => tag.plan ? { type: 'plan', plan: tag.plan, outside: tag.outside } : null

  const pick = (option: Option | undefined) => {
    const tag = current.current
    if (!tag || !option) return
    if (tag.stage === 'plan' && option.type === 'plan') {
      // Keep going: › and the plan's steps, with the whole plan on top.
      setDraft({ ...tag, stage: 'step', plan: option.plan, outside: option.outside, query: '' })
      return
    }
    close(option)
  }

  /** Done with the tag: the whole plan once one's picked, otherwise back to plain text. */
  const settle = () => {
    const tag = current.current
    if (tag) close(tag.stage === 'step' ? wholePlan(tag) : null)
  }

  const typeInto = (text: string) => {
    for (const char of text) {
      const tag = current.current
      if (!tag) { document.execCommand('insertText', false, char); continue }
      if (char === ' ' && tag.stage === 'step' && !tag.query) { close(wholePlan(tag)); continue }
      if (char === '/' && tag.stage === 'plan' && tag.query) { pick(optionsFor(tag, topics, mine, people, orgs, found)[0]); continue }
      setDraft({ ...tag, query: tag.query + char })
    }
  }

  const backspace = () => {
    const tag = current.current
    if (!tag) return
    if (tag.query) setDraft({ ...tag, query: tag.query.slice(0, -1) })
    else if (tag.stage === 'step') setDraft({ ...tag, stage: 'plan', plan: undefined, query: tag.plan?.title || '' })
    else { tag.el.remove(); setDraft(null); sync() }
  }

  // While a tag is open, everything typed goes into it (this also covers phone keyboards).
  React.useEffect(() => {
    const node = editor.current
    if (!node) return
    const onBeforeInput = (event: InputEvent) => {
      if (!current.current) return
      event.preventDefault()
      if (event.inputType === 'deleteContentBackward') backspace()
      else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') settle()
      else if (event.data) typeInto(event.data)
    }
    node.addEventListener('beforeinput', onBeforeInput)
    return () => node.removeEventListener('beforeinput', onBeforeInput)
  })

  /** After typing: "/" or "@" and a letter at the start of a word opens a tag. */
  const watch = () => {
    sync()
    const selection = window.getSelection()
    const node = selection?.anchorNode
    if (current.current || !selection?.rangeCount || !node || node.nodeType !== Node.TEXT_NODE || !editor.current?.contains(node)) return
    const before = (node.textContent || '').slice(0, selection.anchorOffset)
    const slash = before.match(/(^|[\s\u00a0\u200b])\/$/)
    const at = before.match(/(^|[\s\u00a0\u200b])@([^\s\u00a0\u200b@/])$/)
    if (slash) open('/', '', node as Text, selection.anchorOffset - 1, selection.anchorOffset)
    else if (at) open('@', at[2], node as Text, selection.anchorOffset - 2, selection.anchorOffset)
  }

  const serialize = () => {
    let text = ''
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) { text += (node.textContent || '').replace(new RegExp(ZWSP, 'g'), '').replace(/\u00a0/g, ' '); return }
      const element = node as HTMLElement
      if (element.dataset?.token) { text += element.dataset.token; return }
      if (element.dataset?.draft) return
      if (element.tagName === 'BR') { text += '\n'; return }
      if (element.tagName === 'DIV' && text && !text.endsWith('\n')) text += '\n'
      element.childNodes.forEach(walk)
    }
    editor.current?.childNodes.forEach(walk)
    return text.trim()
  }

  const clear = () => {
    if (editor.current) editor.current.innerHTML = ''
    setDraft(null)
    sync()
  }

  const send = async () => {
    settle()
    const body = serialize()
    if (!body || sending || disabled) return
    setSending(true)
    try {
      if (await onSend(body)) clear()
    } finally {
      setSending(false)
    }
  }

  /** From the + menu: open a tag where the caret is, or at the end. */
  const begin = (char: '/' | '@') => {
    const node = editor.current
    if (!node) return
    node.focus()
    settle()
    const selection = window.getSelection()
    let anchor = selection?.anchorNode
    if (!selection?.rangeCount || !anchor || !node.contains(anchor) || anchor.nodeType !== Node.TEXT_NODE) {
      anchor = document.createTextNode('')
      node.append(anchor)
      place(anchor, 0)
    }
    const text = anchor as Text
    const offset = window.getSelection()?.anchorOffset || 0
    const before = (text.textContent || '').slice(0, offset)
    const lead = before && !SPACE.test(before.slice(-1)) ? ' ' : ''
    text.insertData(offset, `${lead}${char}`)
    open(char, '', text, offset + lead.length, offset + lead.length + 1)
  }

  React.useImperativeHandle(ref, () => ({ focus: () => editor.current?.focus(), clear }))

  const heading = draft?.stage === 'person' ? 'People and organizations' : draft?.stage === 'step' ? `In ${draft.plan?.title || 'this plan'}` : 'Plans'
  return <div className="relative">
    {draft ? <div role="listbox" aria-label={heading}
      className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-[min(22rem,100%)] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-xl">
      <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{heading}</p>
      {options.length ? options.map((option, index) => <button key={index} type="button" role="option" aria-selected={index === active}
        onMouseDown={(event) => { event.preventDefault(); pick(option) }} onMouseEnter={() => setActive(index)}
        className={cn('flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left', index === active && 'bg-muted')}>
        <OptionIcon option={option} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{label(option)}</span>
          <span className="block truncate text-xs text-muted-foreground">{detail(option)}</span>
        </span>
      </button>) : <p className="px-2 py-2 text-sm text-muted-foreground">{draft.stage === 'person' ? 'No one by that name' : 'Nothing matches'}</p>}
    </div> : null}
    <div className="hub-composer-shell rounded-[1.4rem] p-2">
      <div className="relative">
        {empty ? <span aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 text-base leading-6 text-muted-foreground">{disabled || placeholder}</span> : null}
        <div ref={editor} role="textbox" aria-multiline="true" aria-label="Message" contentEditable={!disabled && !sending} suppressContentEditableWarning
          className={cn('max-h-48 min-h-11 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-base leading-6 outline-none', draft && 'caret-transparent')}
          onInput={watch}
          onBlur={() => setTimeout(() => { if (document.activeElement !== editor.current) settle() }, 120)}
          onPaste={(event) => { event.preventDefault(); const text = event.clipboardData.getData('text/plain'); if (current.current) typeInto(text); else document.execCommand('insertText', false, text) }}
          onKeyDown={(event) => {
            if (current.current) {
              const tag = current.current
              const count = options.length
              if (event.key === 'ArrowDown' && count) { event.preventDefault(); setActive((active + 1) % count); return }
              if (event.key === 'ArrowUp' && count) { event.preventDefault(); setActive((active - 1 + count) % count); return }
              if (event.key === 'Enter') { event.preventDefault(); if (top) pick(top); else settle(); return }
              if (event.key === 'Tab') { event.preventDefault(); if (tag.stage === 'step' && !tag.query) close(wholePlan(tag)); else if (tag.stage === 'plan' && top?.type === 'plan') close(top); else pick(top); return }
              if (event.key === 'Escape') { event.preventDefault(); settle(); return }
              if (event.key === 'Backspace') { event.preventDefault(); backspace(); return }
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); return }
              return
            }
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
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground"><b className="font-semibold">/</b> plans<span className="hidden sm:inline"> and steps</span> · <b className="font-semibold">@</b> people</span>
        <Button type="button" size="icon" className="h-9 w-9 rounded-xl" disabled={empty || sending || Boolean(disabled)} aria-label="Send message" onMouseDown={(event) => event.preventDefault()} onClick={() => void send()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  </div>
})

export default TagComposer
