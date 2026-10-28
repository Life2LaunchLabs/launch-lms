'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Copy, GitBranch, LayoutGrid, List, MoreHorizontal, Play, Plus, Trash2, X } from 'lucide-react'
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
import type { BranchPath, Sequence, SequenceBranch } from '@components/Learning/generated/content'
import { backgroundLook, resolveBackground } from '@components/Learning/player/design'
import type { FlowVariable } from './flowVariables'
import { branchVariable, opsFor, readRule, ruleSummary, valuesFor, writeRule, type RuleOp } from './branchRules'
import { locate, orderedPageUuids, sequenceItems, type Where } from './sequence'

export type RailMode = 'pages' | 'branches' | 'grid'

type RailProps = {
  mode: RailMode
  onMode: (mode: RailMode) => void
  sequence: Sequence
  pages: any[]
  settings: any
  selectedUuid?: string
  variables: FlowVariable[]
  issues: string[]
  onSelect: (pageUuid: string) => void
  onMove: (pageUuid: string, where: Where) => void
  onNewPage: () => void
  onNewBranch: () => void
  onDuplicate: (page: any) => void
  onRemove: (page: any) => void
  onFollow: (branchId: string, variable: FlowVariable) => void
  onRule: (branchId: string, pathId: string, rule: any) => void
  onAddPath: (branchId: string) => void
  onRemovePath: (branchId: string, pathId: string) => void
  onRemoveBranch: (branchId: string) => void
}

/** The activity's pages in order, three ways: a list, the branches with their paths side by side, or a grid. */
export function PageRail(props: RailProps) {
  const { mode, onMode, sequence, pages, selectedUuid, issues, onNewPage, onNewBranch } = props
  const pageByUuid = React.useMemo(() => new Map(pages.map((page) => [page.page_uuid, page])), [pages])
  const order = React.useMemo(() => orderedPageUuids(sequence), [sequence])
  const unplaced = pages.filter((page) => !order.includes(page.page_uuid))
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [dropKey, setDropKey] = React.useState<string | null>(null)
  const [shownPath, setShownPath] = React.useState<Record<string, string>>({})

  // The list shows one path per branch: the one holding the selected page.
  React.useEffect(() => {
    if (!selectedUuid) return
    const at = locate(sequence, selectedUuid)
    if (at && !at.main) setShownPath((current) => current[at.branch.id] === at.path.id ? current : { ...current, [at.branch.id]: at.path.id })
  }, [selectedUuid, sequence])

  const drag = {
    dragging,
    dropKey,
    start: (pageUuid: string) => setDragging(pageUuid),
    over: (key: string, event: React.DragEvent) => {
      if (!dragging) return
      event.preventDefault()
      event.stopPropagation()
      if (dropKey !== key) setDropKey(key)
    },
    drop: (where: Where, event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (dragging) props.onMove(dragging, where)
      setDragging(null)
      setDropKey(null)
    },
    end: () => {
      setDragging(null)
      setDropKey(null)
    },
  }
  const ctx: RowContext = { ...props, pageByUuid, order, drag }
  const wide = mode !== 'pages'

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r border-gray-200 bg-white" aria-label="Pages">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label="View">
          <ModeButton active={mode === 'pages'} label="Pages" onClick={() => onMode('pages')}><List size={15} /></ModeButton>
          <ModeButton active={mode === 'branches'} label="Branches" branch onClick={() => onMode('branches')}><GitBranch size={15} /></ModeButton>
          <ModeButton active={mode === 'grid'} label="Grid" onClick={() => onMode('grid')}><LayoutGrid size={15} /></ModeButton>
        </div>
        <div className="flex-1" />
        {mode === 'branches' && (
          <button onClick={onNewBranch} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 px-2.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
            <GitBranch size={14} /> New branch
          </button>
        )}
        <button onClick={onNewPage} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 text-xs font-bold text-white hover:bg-gray-800">
          <Plus size={14} /> New page
        </button>
      </div>
      {wide && (
        <p className="shrink-0 px-4 pt-3 text-xs text-gray-500">
          {mode === 'branches'
            ? 'Each learner takes the first path whose rule matches, or Default, then carries on. Drag pages between paths.'
            : `${order.length} pages. Click one to edit it; drag to reorder.`}
        </p>
      )}
      {issues.length > 0 && (
        <div role="status" className="mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {issues[0]}. Changes to the order save once it&apos;s fixed.
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {mode === 'grid' ? (
          <div className="grid gap-x-3 gap-y-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {order.map((uuid) => {
              const at = locate(sequence, uuid)
              const label = at && !at.main ? `${branchName(at.branch, props.variables)} · ${ruleSummary(at.path.rule, branchVariable(at.branch, props.variables))}` : ''
              return <PageRow key={uuid} ctx={ctx} pageUuid={uuid} width={190} where={whereOf(sequence, uuid)} label={label} onOpen={() => onMode('pages')} />
            })}
          </div>
        ) : (
          <div className={mode === 'branches' ? 'mx-auto flex w-fit min-w-[260px] flex-col items-stretch' : 'flex flex-col'}>
            {sequenceItems(sequence).map((item, index) => item.type === 'page'
              ? <PageRow key={item.page_uuid} ctx={ctx} pageUuid={item.page_uuid} width={mode === 'branches' ? 190 : 168} where={{ index }} />
              : <BranchBlock key={item.id} ctx={ctx} branch={item} wide={mode === 'branches'} shownPathId={shownPath[item.id]} onShowPath={(pathId) => setShownPath((current) => ({ ...current, [item.id]: pathId }))} />)}
            <DropZone ctx={ctx} dropId={`main:${sequenceItems(sequence).length}`} where={{ index: sequenceItems(sequence).length }} />
          </div>
        )}
        {unplaced.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Not shown to learners</p>
            <p className="mb-2 text-xs text-gray-500">Drag a page into the list to bring it back.</p>
            <div className="flex flex-col">
              {unplaced.map((page) => <PageRow key={page.page_uuid} ctx={ctx} pageUuid={page.page_uuid} width={140} where={null} muted />)}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

type RowContext = RailProps & {
  pageByUuid: Map<string, any>
  order: string[]
  drag: {
    dragging: string | null
    dropKey: string | null
    start: (pageUuid: string) => void
    over: (key: string, event: React.DragEvent) => void
    drop: (where: Where, event: React.DragEvent) => void
    end: () => void
  }
}

function whereOf(sequence: Sequence, pageUuid: string): Where | null {
  const at = locate(sequence, pageUuid)
  if (!at) return null
  return at.main ? { index: at.index } : { branchId: at.branch.id, pathId: at.path.id, index: at.index }
}

function ModeButton({ active, label, branch, onClick, children }: { active: boolean; label: string; branch?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex h-7 w-8 items-center justify-center rounded-md transition ${active ? `bg-white shadow-sm ${branch ? 'text-violet-700' : 'text-gray-900'}` : 'text-gray-500 hover:text-gray-800'}`}
    >
      {children}
    </button>
  )
}

function PageRow({ ctx, pageUuid, width, where, label, muted, onOpen }: { ctx: RowContext; pageUuid: string; width: number; where: Where | null; label?: string; muted?: boolean; onOpen?: () => void }) {
  const page = ctx.pageByUuid.get(pageUuid)
  if (!page) return null
  const number = ctx.order.indexOf(pageUuid) + 1
  const selected = ctx.selectedUuid === pageUuid
  const dropId = `page:${pageUuid}`
  const dropping = ctx.drag.dropKey === dropId && ctx.drag.dragging !== pageUuid
  const title = pageHeading(page)
  return (
    <div
      className={`group relative flex w-fit max-w-full items-start gap-2 rounded-xl p-1.5 transition ${selected ? 'bg-sky-50 ring-2 ring-sky-500' : 'hover:bg-gray-50'} ${ctx.drag.dragging === pageUuid ? 'opacity-40' : ''} ${muted ? 'opacity-70' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        try { event.dataTransfer.setData('text/plain', pageUuid) } catch { /* some browsers refuse custom data */ }
        ctx.drag.start(pageUuid)
      }}
      onDragEnd={ctx.drag.end}
      onDragOver={where ? (event) => ctx.drag.over(dropId, event) : undefined}
      onDrop={where ? (event) => ctx.drag.drop(where, event) : undefined}
    >
      {dropping && <span aria-hidden="true" className="absolute -top-1 left-2 right-2 h-0.5 rounded-full bg-sky-500" />}
      <span className="w-5 shrink-0 pt-1 text-right text-[11px] font-bold tabular-nums text-gray-400">{number > 0 ? number : '–'}</span>
      <button
        type="button"
        onClick={() => { ctx.onSelect(pageUuid); onOpen?.() }}
        aria-label={`Page ${number > 0 ? number : ''}: ${title}`.replace('  ', ' ')}
        aria-current={selected ? 'true' : undefined}
        className="min-w-0 text-left"
      >
        <PageThumb page={page} settings={ctx.settings} width={width} />
        {label && <span className="mt-1 flex max-w-full items-center gap-1 truncate text-[11px] font-bold text-violet-700"><GitBranch size={11} className="shrink-0" />{label}</span>}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label={`More for page ${number}`} className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-600 opacity-0 shadow-sm ring-1 ring-gray-200 transition focus:opacity-100 group-hover:opacity-100">
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => ctx.onDuplicate(page)}><Copy size={14} className="mr-2" />Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={() => ctx.onRemove(page)} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function DropZone({ ctx, dropId, where, label, boxed }: { ctx: RowContext; dropId: string; where: Where; label?: string; boxed?: boolean }) {
  const active = ctx.drag.dropKey === dropId
  if (boxed) {
    return (
      <div
        onDragOver={(event) => ctx.drag.over(dropId, event)}
        onDrop={(event) => ctx.drag.drop(where, event)}
        className={`my-1 ml-7 grid min-h-14 place-items-center rounded-xl border-[1.5px] border-dashed px-2 py-2 text-center text-[11.5px] font-bold transition ${active ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-violet-200 text-gray-400'}`}
      >
        {label}
      </div>
    )
  }
  return (
    <div onDragOver={(event) => ctx.drag.over(dropId, event)} onDrop={(event) => ctx.drag.drop(where, event)} className="relative h-6">
      {active && <span aria-hidden="true" className="absolute left-2 right-2 top-1 h-0.5 rounded-full bg-sky-500" />}
    </div>
  )
}

function branchName(branch: SequenceBranch, variables: FlowVariable[]) {
  const variable = branchVariable(branch, variables)
  return variable ? followLabel(variable) : branch.label || 'Branch'
}

export function followLabel(variable: FlowVariable) {
  if (variable.source !== 'answer') return variable.label
  if (variable.valueType === 'button') return `Button pressed on ${variable.pageTitle}`
  // Questions rarely have their own label; the page says what was asked.
  return !variable.label || variable.label === 'Question' ? `Answer to ${variable.pageTitle}` : variable.label
}

function orderedPaths(branch: SequenceBranch): BranchPath[] {
  return [...branch.paths.filter((path) => !path.rule), ...branch.paths.filter((path) => path.rule)]
}

function BranchBlock({ ctx, branch, wide, shownPathId, onShowPath }: { ctx: RowContext; branch: SequenceBranch; wide: boolean; shownPathId?: string; onShowPath: (pathId: string) => void }) {
  const variable = branchVariable(branch, ctx.variables)
  const paths = orderedPaths(branch)
  const shown = paths.find((path) => path.id === shownPathId) || paths[0]
  const shownIndex = paths.indexOf(shown)
  const head = <BranchMenu ctx={ctx} branch={branch} variable={variable} wide={wide} />
  if (!wide) {
    const step = (delta: number) => onShowPath(paths[(shownIndex + delta + paths.length) % paths.length].id)
    return (
      <div className="-mx-3 my-1.5 grid gap-1 border-y-[1.5px] border-violet-300/70 bg-violet-50/70 px-3 py-2" data-branch={branch.id}>
        {head}
        <div className="ml-7 flex items-center gap-1 rounded-lg bg-white px-1 py-0.5 ring-1 ring-violet-200">
          <button aria-label="Previous path" onClick={() => step(-1)} className="flex h-6 w-6 items-center justify-center rounded text-violet-700 hover:bg-violet-50"><ChevronLeft size={14} /></button>
          <b className="min-w-0 flex-1 truncate text-center text-xs text-violet-800" title={ruleSummary(shown.rule, variable)}>{ruleSummary(shown.rule, variable)}</b>
          <span className="text-[10px] font-bold text-gray-400">{shownIndex + 1}/{paths.length}</span>
          <button aria-label="Next path" onClick={() => step(1)} className="flex h-6 w-6 items-center justify-center rounded text-violet-700 hover:bg-violet-50"><ChevronRight size={14} /></button>
        </div>
        <PathStack ctx={ctx} branch={branch} path={shown} width={150} />
      </div>
    )
  }
  return (
    <div className="my-2 rounded-2xl border-[1.5px] border-violet-300/70 bg-violet-50/60 px-3 py-3" data-branch={branch.id}>
      <div className="flex justify-center">{head}</div>
      <div className="mt-2 flex items-start justify-center gap-3">
        {paths.map((path) => (
          <div key={path.id} className="flex w-[236px] shrink-0 flex-col gap-1">
            {path.rule ? <RuleChip ctx={ctx} branch={branch} path={path} variable={variable} /> : <div className="ml-7 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-600 ring-1 ring-violet-200">Default</div>}
            <PathStack ctx={ctx} branch={branch} path={path} width={180} />
          </div>
        ))}
        <button onClick={() => ctx.onAddPath(branch.id)} className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-xl border-[1.5px] border-dashed border-violet-300 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-100/60">
          <Plus size={13} /> Path
        </button>
      </div>
    </div>
  )
}

function PathStack({ ctx, branch, path, width }: { ctx: RowContext; branch: SequenceBranch; path: BranchPath; width: number }) {
  const pages = path.pages || []
  return (
    <div className="flex flex-col">
      {pages.map((uuid, index) => <PageRow key={uuid} ctx={ctx} pageUuid={uuid} width={width} where={{ branchId: branch.id, pathId: path.id, index }} />)}
      <DropZone
        ctx={ctx}
        dropId={`path:${branch.id}:${path.id}`}
        where={{ branchId: branch.id, pathId: path.id, index: pages.length }}
        boxed={!pages.length}
        label={path.rule ? 'Drop pages here' : 'Goes straight on'}
      />
    </div>
  )
}

function BranchMenu({ ctx, branch, variable, wide }: { ctx: RowContext; branch: SequenceBranch; variable: FlowVariable | null; wide: boolean }) {
  // A branch can follow the answers that come before it, and what we know about the learner.
  const before = React.useMemo(() => {
    const items = sequenceItems(ctx.sequence)
    const index = items.indexOf(branch)
    return new Set(items.slice(0, Math.max(0, index)).flatMap((item) => item.type === 'page' ? [item.page_uuid] : item.paths.flatMap((path) => path.pages || [])))
  }, [branch, ctx.sequence])
  const answers = ctx.variables.filter((item) => item.source === 'answer' && item.pageUuid && before.has(item.pageUuid) && item.valueType !== 'image')
  const learner = ctx.variables.filter((item) => item.source !== 'answer' && item.valueType !== 'image')
  const label = variable ? followLabel(variable) : branch.on?.key || branch.paths.some((path) => path.rule) ? 'Custom rule' : 'Choose what to branch on'
  const follow = (item: FlowVariable) => ctx.onFollow(branch.id, item)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={`inline-flex max-w-full items-center gap-1.5 justify-self-start rounded-lg py-1 pl-1 pr-1.5 text-left text-[12.5px] font-extrabold hover:bg-violet-100 ${variable ? 'text-violet-700' : 'text-violet-500'}`} title={variable ? `${variable.pageTitle ? `${variable.pageTitle} › ` : ''}${variable.label}` : undefined}>
          <GitBranch size={14} className="shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown size={13} className="shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change what it follows</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-gray-500">Answers before this branch</DropdownMenuLabel>
            {answers.length ? answers.map((item) => (
              <DropdownMenuItem key={item.target} onClick={() => follow(item)}>
                <span className="min-w-0"><span className="block truncate">{followLabel(item)}</span><span className="block truncate text-xs text-gray-500">{item.pageTitle}</span></span>
              </DropdownMenuItem>
            )) : <p className="px-2 pb-2 text-xs text-gray-500">No questions or buttons come before it yet.</p>}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-gray-500">The learner</DropdownMenuLabel>
            {learner.map((item) => <DropdownMenuItem key={item.target} onClick={() => follow(item)}>{item.label}</DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {!wide && <DropdownMenuItem onClick={() => ctx.onMode('branches')}>Show all paths</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => ctx.onRemoveBranch(branch.id)} className="text-red-600">Remove branch</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RuleChip({ ctx, branch, path, variable }: { ctx: RowContext; branch: SequenceBranch; path: BranchPath; variable: FlowVariable | null }) {
  const view = readRule(path.rule, variable)
  const remove = (
    <button aria-label="Remove this path" onClick={() => ctx.onRemovePath(branch.id, path.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700">
      <X size={13} />
    </button>
  )
  const box = 'ml-7 flex min-w-0 items-center gap-1 rounded-lg bg-white p-1 ring-1 ring-violet-200'
  if (!view || !variable) {
    return <div className={box}><span className="flex-1 truncate px-1.5 text-xs font-bold text-gray-600">{variable ? 'Custom rule' : 'Choose what to branch on first'}</span>{remove}</div>
  }
  const on = branch.on || (path.rule as any)?.left || (path.rule as any)?.condition?.left
  const values = valuesFor(variable)
  const set = (op: RuleOp, right: any) => ctx.onRule(branch.id, path.id, writeRule(on, op, right, variable))
  return (
    <div className={box}>
      <select aria-label="Rule" value={view.op} onChange={(event) => set(event.target.value as RuleOp, view.right ?? (values?.[0]?.value ?? ''))} className="shrink-0 rounded bg-transparent py-0.5 text-xs font-bold text-violet-700 outline-none">
        {opsFor(variable).map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>
      {view.op === 'answered' ? <span className="flex-1" /> : values ? (
        <select aria-label="Value" value={JSON.stringify(view.right ?? '')} onChange={(event) => set(view.op, JSON.parse(event.target.value))} className="min-w-0 flex-1 truncate rounded bg-transparent py-0.5 text-xs font-semibold text-gray-800 outline-none">
          {!values.some((option) => JSON.stringify(option.value) === JSON.stringify(view.right)) && <option value={JSON.stringify(view.right ?? '')}>Choose…</option>}
          {values.map((option) => <option key={JSON.stringify(option.value)} value={JSON.stringify(option.value)}>{option.label}</option>)}
        </select>
      ) : (
        <input
          aria-label="Value"
          value={view.right ?? ''}
          type={variable.valueType === 'number' ? 'number' : 'text'}
          placeholder={variable.valueType === 'number' ? '0' : 'a word'}
          onChange={(event) => set(view.op, event.target.value)}
          className="min-w-0 flex-1 rounded bg-gray-50 px-1.5 py-0.5 text-xs text-gray-800 outline-none focus:bg-white focus:ring-1 focus:ring-violet-300"
        />
      )}
      {remove}
    </div>
  )
}

/** A page's title for lists: its heading, else its stored title. */
export function pageHeading(page: any): string {
  const blocks: any[] = page?.content?.blocks || []
  const heading = blocks.find((block) => block?.type === 'heading')
  if (heading?.content?.text) return String(heading.content.text)
  if (page?.page_type === 'video' && page.content?.heading) return String(page.content.heading)
  return page?.title || 'Untitled page'
}

const SKETCH: Record<string, (block: any, dark: boolean) => React.ReactNode> = {
  text: (_, dark) => <><i className={`block h-1 w-full rounded ${dark ? 'bg-white/40' : 'bg-gray-300'}`} /><i className={`block h-1 w-3/4 rounded ${dark ? 'bg-white/40' : 'bg-gray-300'}`} /></>,
  image: (block) => block.content?.src ? <span className="block h-7 w-full rounded bg-cover bg-center" style={{ backgroundImage: `url("${String(block.content.src).replace(/"/g, '%22')}")` }} /> : <i className="block h-7 w-full rounded bg-gray-200" />,
  question: (block, dark) => block.kind === 'text_input'
    ? <i className={`block h-3 w-full rounded border ${dark ? 'border-white/40' : 'border-gray-300 bg-white'}`} />
    : <span className="flex flex-col gap-0.5">{[0, 1, 2].map((key) => <i key={key} className={`block h-1.5 w-full rounded-sm ${dark ? 'bg-white/30' : 'bg-gray-200'}`} />)}</span>,
  number: (block) => <b className="block text-[13px] font-black leading-none" style={{ color: 'var(--org-primary-color, #2563eb)' }}>{block.content?.prefix}{block.content?.value ?? 0}{block.content?.suffix}</b>,
  card_deck: (_, dark) => <i className={`block h-6 w-4/5 rounded-md ${dark ? 'bg-white/25' : 'bg-white shadow ring-1 ring-gray-200'}`} />,
  button: (_, dark) => <i className={`block h-2 w-10 rounded-full ${dark ? 'bg-white/50' : 'bg-gray-800'}`} />,
}

/** A small sketch of a page: its background, heading and a line or shape for each block. */
export function PageThumb({ page, settings, width }: { page: any; settings: any; width: number }) {
  const height = Math.round(width * 0.62)
  if (page.page_type === 'video') {
    return (
      <span className="relative block overflow-hidden rounded-lg ring-1 ring-gray-200" style={{ width, height, background: 'linear-gradient(160deg, #1e293b, #020617)' }}>
        <span className="absolute inset-0 grid place-items-center text-white/80"><Play size={20} fill="currentColor" /></span>
        <span className="absolute bottom-1.5 left-2 right-2 truncate text-[10px] font-bold text-white">{pageHeading(page)}</span>
      </span>
    )
  }
  const look = backgroundLook(resolveBackground(page, settings))
  const dark = look.tone.includes('dark')
  const blocks: any[] = (page.content?.blocks || []).filter((block: any) => block?.type !== 'heading' && block?.type !== 'column_break')
  const columns = page.design?.columns === 2
  const valign = page.design?.valign === 'bottom' ? 'justify-end' : page.design?.valign === 'top' ? 'justify-start' : 'justify-center'
  return (
    <span className={`relative flex flex-col gap-1 overflow-hidden rounded-lg px-2.5 py-2 ring-1 ring-gray-200 ${valign} ${look.style ? '' : 'bg-white'}`} style={{ width, height, ...look.style }}>
      <b className={`line-clamp-2 text-[10px] font-extrabold leading-tight ${dark ? 'text-white' : 'text-gray-900'}`}>{pageHeading(page)}</b>
      <span className={`flex min-h-0 flex-col gap-0.5 ${columns ? 'w-1/2' : ''}`}>
        {blocks.slice(0, 3).map((block, index) => <span key={block.id || index} className="block">{SKETCH[block.type]?.(block, dark) ?? null}</span>)}
      </span>
    </span>
  )
}
