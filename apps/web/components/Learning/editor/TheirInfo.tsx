'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import { BookmarkCheck, ChevronDown, Plus, UserRound } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { findQuestionBlocks } from '@components/Learning/schema'
import { THEIR_INFO_EVENT } from '@components/Learning/displayBindingNode'
import { pageHeading } from './PageRail'
import { button, on } from './toolbarParts'

// "Their info": what an activity can show about the learner (inserted into text as a chip), and
// where a question keeps its answer: their Portfolio (they see it, Coach reads it) or the
// organization's Learner details (staff and Insights see them, Coach reads them).

type Item = { source: 'variable' | 'answer'; path: string; label: string; hint?: string }
type Group = { name: string; items: Item[] }

const DETAIL = 'user.details.variables.'
const PORTFOLIO_KEEPS = [
  { target: 'user.portfolio.headline', label: 'Headline' },
  { target: 'user.portfolio.strengths', label: 'Strengths' },
  { target: 'user.portfolio.values', label: 'Values' },
]

/** Everything an author can insert, grouped as the picker shows it. */
export function infoGroups(variables: any[], pages: any[], pageOrder: string[], currentPageUuid?: string): Group[] {
  const v = (path: string, label: string, hint?: string): Item => ({ source: 'variable', path, label, hint })
  const byUuid = new Map(pages.map((page) => [page.page_uuid, page]))
  const earlier = pageOrder.slice(0, Math.max(0, pageOrder.indexOf(currentPageUuid || '')))
  const answers = earlier.flatMap((uuid) => {
    const page = byUuid.get(uuid)
    const number = pageOrder.indexOf(uuid) + 1
    return page ? findQuestionBlocks(page).filter((block: any) => block.kind !== 'image_upload').map((block: any): Item => ({
      source: 'answer',
      path: `${uuid}.result.questions.${block.id}.${block.kind === 'text_input' ? 'text' : 'selected_labels'}`,
      label: `Page ${number}: ${pageHeading(page)}`,
      hint: block.kind === 'text_input' ? 'What they wrote' : 'What they picked',
    })) : []
  })
  return [
    { name: 'The learner', items: [v('user.first_name', 'First name'), v('user.last_name', 'Last name')] },
    { name: 'Their portfolio', items: [v('user.portfolio.headline', 'Headline'), v('user.portfolio.strengths', 'Strengths'), v('user.portfolio.values', 'Values')] },
    { name: 'Learner details', items: [...variables].sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key))).map((variable) => v(`${DETAIL}${variable.key}`, variable.label || variable.key)) },
    { name: 'This plan', items: [v('goal.title', 'Plan title'), v('goal.why', 'Why it matters to them')] },
    { name: 'Answers in this activity', items: answers },
  ]
}

/** The "Their info" toolbar menu for a text block; also opens when the author types `{`. */
export function TheirInfoMenu({ editor, groups }: { editor: any; groups: Group[] }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(THEIR_INFO_EVENT, show)
    return () => window.removeEventListener(THEIR_INFO_EVENT, show)
  }, [])
  const insert = (item: Item) => {
    const label = item.label.replace(/^Page \d+: /, '')
    editor?.chain().focus().insertContent([
      { type: 'displayBinding', attrs: { binding: { source: item.source, path: item.path, fallback: '' }, label: label.length > 24 ? 'Their answer' : label } },
      { type: 'text', text: ' ' },
    ]).run()
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={button} title="Insert what you know about them (or type {)"><UserRound size={14} />Their info<ChevronDown size={13} className="text-gray-400" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" onCloseAutoFocus={(event) => { event.preventDefault(); editor?.commands.focus() }}>
        <DropdownMenuLabel className="text-xs text-gray-500">Each learner sees their own. Tip: type {'{'} while writing.</DropdownMenuLabel>
        {groups.map((group) => (
          <DropdownMenuSub key={group.name}>
            <DropdownMenuSubTrigger className="font-bold">{group.name}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
              {group.items.length ? group.items.map((item) => (
                <DropdownMenuItem key={`${item.source}:${item.path}`} onSelect={() => insert(item)} className="flex flex-col items-start gap-0">
                  <span className="font-bold">{item.label}</span>
                  {item.hint && <span className="text-xs text-gray-500">{item.hint}</span>}
                </DropdownMenuItem>
              )) : <p className="px-2 py-1.5 text-xs text-gray-500">{group.name === 'Learner details' ? 'None yet. A question can keep its answer as a new learner detail.' : 'No questions before this page.'}</p>}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Where a question keeps its answer: `completion.variable_bindings.keep`. */
export function keptTarget(block: any): string {
  return String(block?.completion?.variable_bindings?.keep?.[0]?.target || '')
}

/** Older answers saved anywhere else (onboarding fields and the like); shown, not offered. */
function otherTargets(block: any): string[] {
  const bindings = block?.completion?.variable_bindings || {}
  return [
    ...(bindings.selected || []),
    ...[bindings.image].flat(),
    ...Object.values(bindings.inputs || {}).flat(),
    ...Object.values(bindings.options || {}).flat(),
  ].map((binding: any) => String(binding?.target || '')).filter(Boolean).filter((target, index, all) => all.indexOf(target) === index)
}

export function keptLabel(target: string, variables: any[]): string {
  const portfolio = PORTFOLIO_KEEPS.find((item) => item.target === target)
  if (portfolio) return `Portfolio › ${portfolio.label}`
  if (target.startsWith(DETAIL)) {
    const key = target.slice(DETAIL.length)
    return `Learner details › ${variables.find((variable) => variable.key === key)?.label || key}`
  }
  return target
}

const slug = (label: string) => label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)

/** The question toolbar's "Keep answer" menu. */
export function KeepMenu({ block, variables, onPatch, onCreateDetail }: { block: any; variables: any[]; onPatch: (patch: any) => void; onCreateDetail: (key: string, label: string) => Promise<any> }) {
  const [naming, setNaming] = React.useState('')
  const target = keptTarget(block)
  const other = otherTargets(block)
  const completion = block.completion || {}
  const keep = (next: string) => {
    const bindings = { ...(completion.variable_bindings || {}) }
    if (next) bindings.keep = [{ target: next }]
    else delete bindings.keep
    onPatch({ completion: { ...completion, variable_bindings: bindings } })
  }
  const create = async () => {
    const label = naming.trim()
    const key = slug(label)
    if (!key) return
    const existing = variables.find((variable) => variable.key === key)
    const made = existing || await onCreateDetail(key, label)
    if (made) { keep(`${DETAIL}${key}`); setNaming('') }
  }
  const item = (value: string, label: string) => (
    <DropdownMenuItem key={value} onSelect={() => keep(value)}>{label}<span className={`ml-auto pl-4 text-xs font-bold ${target === value ? 'text-sky-600' : 'text-transparent'}`}>✓</span></DropdownMenuItem>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${button} ${target ? on : ''}`} title={target ? `Kept in ${keptLabel(target, variables)}` : 'Keep their answer'}><BookmarkCheck size={14} />{target ? 'Kept' : 'Keep answer'}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-72 overflow-y-auto">
        <DropdownMenuLabel>Portfolio<span className="block text-xs font-normal text-gray-500">Theirs to see and edit. Coach reads it.</span></DropdownMenuLabel>
        {PORTFOLIO_KEEPS.map((keepItem) => item(keepItem.target, keepItem.label))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Learner details<span className="block text-xs font-normal text-gray-500">Your organization&apos;s fields. Staff, Insights and Coach see them.</span></DropdownMenuLabel>
        {[...variables].sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key))).map((variable) => item(`${DETAIL}${variable.key}`, variable.label || variable.key))}
        <div className="flex gap-1.5 p-1.5" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); void create() } }}>
          <input value={naming} onChange={(event) => setNaming(event.target.value)} placeholder="New learner detail" aria-label="New learner detail" className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-transparent px-2 text-sm outline-none focus:border-sky-400" />
          <button type="button" onClick={() => void create()} disabled={!naming.trim()} aria-label="Add learner detail" className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 disabled:opacity-40"><Plus size={14} /></button>
        </div>
        {target && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => keep('')}>Don&apos;t keep it</DropdownMenuItem></>}
        {other.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs font-normal text-gray-500">Also saved to (older setup): {other.join(', ')}</DropdownMenuLabel></>}
        <p className="px-2 pb-2 pt-1 text-xs text-gray-500">Learners see a small note when an answer is kept, so nothing is saved without them knowing.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
