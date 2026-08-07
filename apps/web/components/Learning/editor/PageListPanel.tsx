'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Copy, FileText, GitBranch, GripVertical, ListChecks, Plus, Trash2, Video } from 'lucide-react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { findQuestionBlock, findQuestionBlocks, type LearningPageType } from '@components/Learning/schema'
import {
  collectPath,
  createLinearFlow,
  displayBranches,
  movePage,
  nearestCommonJoin,
  type Flow,
  type FlowEdge,
  type StackContext,
} from './VisualFlowEditor'

type PageListPanelProps = {
  pages: any[]
  selectedPage: any
  onSelectPage: (pageUuid: string) => void
  onAddPage: (pageType: LearningPageType) => void
  onDuplicatePage: (page: any) => void
  onRemovePage: (page: any) => void
  flow?: Flow
  onChangeFlow: (flow: Flow) => void
}

export function PageListPanel({
  pages,
  selectedPage,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onRemovePage,
  flow: suppliedFlow,
  onChangeFlow,
}: PageListPanelProps) {
  const flow = React.useMemo(() => suppliedFlow || createLinearFlow(pages), [pages, suppliedFlow])
  const [activeBranches, setActiveBranches] = React.useState<Record<string, number>>({})
  const stackContexts = React.useRef<Map<string, StackContext>>(new Map())
  const registerStack = React.useCallback((stackId: string, context: StackContext) => {
    stackContexts.current.set(stackId, context)
    return () => {
      if (stackContexts.current.get(stackId) === context) stackContexts.current.delete(stackId)
    }
  }, [])

  React.useEffect(() => {
    if (!selectedPage?.page_uuid) return
    const target = `page:${selectedPage.page_uuid}`
    setActiveBranches((current) => {
      const next = { ...current }
      flow.nodes.filter((node) => node.type === 'split').forEach((node) => {
        const branches = displayBranches(flow, node.id)
        const index = branches.findIndex((edge) => sidebarCanReach(flow, edge.to, target))
        if (index >= 0) next[node.id] = index
      })
      return next
    })
  }, [flow, selectedPage?.page_uuid])

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const source = stackContexts.current.get(result.source.droppableId)
    const destination = stackContexts.current.get(result.destination.droppableId)
    if (!source || !destination) return
    onChangeFlow(movePage(flow, result.draggableId, source, destination, result.destination.index))
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-gray-200 bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-100 px-4">
        <div>
          <p className="text-[11px] font-bold uppercase text-gray-500">Pages</p>
          <p className="text-xs text-gray-400">{pages.length} total</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50" title="Add page">
              <Plus size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAddPage('standard')}>
              <FileText size={16} className="mr-2" />
              Standard page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddPage('video')}>
              <Video size={16} className="mr-2" />
              Video page
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <DragDropContext onDragEnd={onDragEnd}>
          <SidebarFlowPath
            flow={flow}
            startId={flow.entry}
            stackId="sidebar-root"
            depth={0}
            pages={pages}
            selectedPage={selectedPage}
            activeBranches={activeBranches}
            setActiveBranches={setActiveBranches}
            registerStack={registerStack}
            onSelectPage={onSelectPage}
            onDuplicatePage={onDuplicatePage}
            onRemovePage={onRemovePage}
          />
        </DragDropContext>
      </div>
      <div className="border-t border-gray-100 p-3">
        <button onClick={() => onAddPage('standard')} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm font-bold text-gray-600 hover:border-gray-400 hover:bg-gray-50">
          <Plus size={16} />
          Add page
        </button>
      </div>
    </aside>
  )
}

function sidebarCanReach(flow: Flow, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  return flow.edges.filter((edge) => edge.from === from).some((edge) => sidebarCanReach(flow, edge.to, target, new Set(seen)))
}

function splitVariableName(flow: Flow, nodeId: string, pages: any[]) {
  const key = String(displayBranches(flow, nodeId).find((edge) => edge.condition)?.condition?.left?.key || '')
  for (const page of pages) {
    const block = findQuestionBlocks(page).find((question: any) => key.includes(String(question.id)))
    if (block) return String(block.content?.label || block.content?.title || 'Question')
  }
  return (key.split('.').filter(Boolean).at(-1) || 'Variable').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function branchTitle(edge: FlowEdge, pages: any[]) {
  if (!edge.condition) return 'Default'
  const right = edge.condition.right
  for (const page of pages) {
    for (const block of findQuestionBlocks(page) as any[]) {
      const option = (Array.isArray(block.content?.options) ? block.content.options : []).find((item: any) => String(item.id || item.value) === String(right))
      if (option) return String(option.text || option.label || right)
    }
  }
  const operator = ({ lt: '<', lte: '≤', eq: 'is', contains: 'is', gte: '≥', gt: '>' } as Record<string, string>)[edge.condition.op] || edge.condition.op
  return right === undefined || right === null || right === '' ? String(operator || 'Rule') : `${operator} ${String(right)}`
}

function SidebarFlowPath({ flow, startId, entryEdge, boundaryJoinId, stackId, depth, pages, selectedPage, activeBranches, setActiveBranches, registerStack, onSelectPage, onDuplicatePage, onRemovePage }: any) {
  const model = collectPath(flow, startId, entryEdge)
  React.useLayoutEffect(
    () => registerStack(stackId, { ...model, stackId, startId, entryEdge }),
    [entryEdge, model, registerStack, stackId, startId],
  )
  const pageByUuid = new Map(pages.map((page: any) => [page.page_uuid, page]))
  const outgoingEdge = model.joinId ? flow.edges.find((edge: FlowEdge) => edge.from === model.joinId) : undefined

  return (
    <div className="min-w-0">
      <Droppable droppableId={stackId}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={`space-y-2 rounded-lg transition ${model.nodes.length === 0 ? 'min-h-1' : ''} ${snapshot.isDraggingOver ? 'bg-violet-50 ring-2 ring-violet-200' : ''}`}>
            {model.nodes.map((node, index) => {
              const page = pageByUuid.get(node.page_uuid)
              if (!page) return null
              return (
                <Draggable key={node.id} draggableId={node.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} style={{ ...dragProvided.draggableProps.style, zIndex: dragSnapshot.isDragging ? 70 : undefined }} className={dragSnapshot.isDragging ? 'rounded-lg shadow-xl' : 'rounded-lg'}>
                      <SidebarPageCard page={page} pages={pages} selectedPage={selectedPage} dragHandleProps={dragProvided.dragHandleProps} onSelectPage={onSelectPage} onDuplicatePage={onDuplicatePage} onRemovePage={onRemovePage} />
                    </div>
                  )}
                </Draggable>
              )
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {model.decisionId && (
        <SidebarSplitSection
          flow={flow}
          nodeId={model.decisionId}
          boundaryJoinId={boundaryJoinId}
          stackId={stackId}
          depth={depth}
          pages={pages}
          selectedPage={selectedPage}
          activeBranches={activeBranches}
          setActiveBranches={setActiveBranches}
          registerStack={registerStack}
          onSelectPage={onSelectPage}
          onDuplicatePage={onDuplicatePage}
          onRemovePage={onRemovePage}
        />
      )}

      {model.joinId && model.joinId !== boundaryJoinId && outgoingEdge && (
        <SidebarFlowPath flow={flow} startId={outgoingEdge.to} entryEdge={outgoingEdge} boundaryJoinId={boundaryJoinId} stackId={`${stackId}/after-${model.joinId}`} depth={depth} pages={pages} selectedPage={selectedPage} activeBranches={activeBranches} setActiveBranches={setActiveBranches} registerStack={registerStack} onSelectPage={onSelectPage} onDuplicatePage={onDuplicatePage} onRemovePage={onRemovePage} />
      )}
    </div>
  )
}

function SidebarSplitSection({ flow, nodeId, boundaryJoinId, stackId, depth, pages, selectedPage, activeBranches, setActiveBranches, registerStack, onSelectPage, onDuplicatePage, onRemovePage }: any) {
  const branches = displayBranches(flow, nodeId)
  const commonJoinId = nearestCommonJoin(flow, branches)
  const selectedIndex = Math.max(0, Math.min(Number(activeBranches[nodeId] || 0), Math.max(0, branches.length - 1)))
  const selectedEdge = branches[selectedIndex]
  const [direction, setDirection] = React.useState<'left' | 'right'>('right')
  const choose = (delta: number) => {
    const nextIndex = selectedIndex + delta
    if (nextIndex < 0 || nextIndex >= branches.length) return
    setDirection(delta > 0 ? 'right' : 'left')
    setActiveBranches((current: Record<string, number>) => ({ ...current, [nodeId]: nextIndex }))
  }
  const canGoLeft = selectedIndex > 0
  const canGoRight = selectedIndex < branches.length - 1
  const elevation = ['bg-gray-50/90', 'bg-gray-100/80', 'bg-gray-200/55', 'bg-gray-300/35'][Math.min(depth, 3)]
  const exit = commonJoinId ? flow.edges.find((edge: FlowEdge) => edge.from === commonJoinId) : undefined
  return (
    <>
      <section className={`-mx-3 mt-3 border-y border-gray-200 px-3 py-2 ${elevation}`}>
        <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-gray-500"><GitBranch size={12} /><span className="truncate">{splitVariableName(flow, nodeId, pages)}</span></div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <button type="button" onClick={() => choose(-1)} disabled={!canGoLeft} aria-label="Previous path" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-gray-700 disabled:pointer-events-none disabled:opacity-0"><ChevronLeft size={14} /></button>
          <span className="min-w-0 flex-1 truncate text-center text-xs font-bold text-gray-700">{selectedEdge ? branchTitle(selectedEdge, pages) : 'Empty path'}</span>
          <button type="button" onClick={() => choose(1)} disabled={!canGoRight} aria-label="Next path" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-gray-700 disabled:pointer-events-none disabled:opacity-0"><ChevronRight size={14} /></button>
        </div>
        {selectedEdge && (
          <div key={`${nodeId}:${selectedIndex}`} className={`animate-in fade-in-0 duration-200 ${direction === 'right' ? 'slide-in-from-right-4' : 'slide-in-from-left-4'}`}>
            <SidebarFlowPath flow={flow} startId={selectedEdge.to} entryEdge={selectedEdge} boundaryJoinId={commonJoinId || boundaryJoinId} stackId={`${stackId}/split-${nodeId}/branch-${selectedIndex}`} depth={depth + 1} pages={pages} selectedPage={selectedPage} activeBranches={activeBranches} setActiveBranches={setActiveBranches} registerStack={registerStack} onSelectPage={onSelectPage} onDuplicatePage={onDuplicatePage} onRemovePage={onRemovePage} />
          </div>
        )}
      </section>
      {commonJoinId && commonJoinId !== boundaryJoinId && exit && (
        <div className="pt-3">
          <SidebarFlowPath flow={flow} startId={exit.to} entryEdge={exit} boundaryJoinId={boundaryJoinId} stackId={`${stackId}/split-${nodeId}/after-${commonJoinId}`} depth={depth} pages={pages} selectedPage={selectedPage} activeBranches={activeBranches} setActiveBranches={setActiveBranches} registerStack={registerStack} onSelectPage={onSelectPage} onDuplicatePage={onDuplicatePage} onRemovePage={onRemovePage} />
        </div>
      )}
    </>
  )
}

function SidebarPageCard({ page, pages, selectedPage, dragHandleProps, onSelectPage, onDuplicatePage, onRemovePage }: any) {
  const question = findQuestionBlocks(page).length > 0
  const variantIssue = getVariantIssue(page, pages)
  return (
    <button type="button" onClick={() => onSelectPage(page.page_uuid)} className={`group flex w-full items-center gap-2 rounded-lg border p-2 text-left transition ${selectedPage?.page_uuid === page.page_uuid ? 'border-[var(--org-primary-color)] bg-[color-mix(in_srgb,var(--org-primary-color)_8%,white)]' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}>
      <span {...dragHandleProps} className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-gray-400 opacity-0 transition hover:bg-gray-100 group-hover:opacity-100 active:cursor-grabbing"><GripVertical size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5"><span className="block min-w-0 flex-1 truncate text-sm font-bold">{page.title || 'Untitled page'}</span>{variantIssue && <span title={variantIssue} className="shrink-0 text-amber-600"><AlertTriangle size={14} /></span>}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">{page.page_type === 'video' ? <Video size={12} /> : question ? <ListChecks size={12} /> : <FileText size={12} />}{page.page_type === 'video' ? 'Video' : question ? 'Question' : 'Info'}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition hover:bg-gray-100 group-hover:opacity-100"><ChevronDown size={15} /></span></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onDuplicatePage(page) }}><Copy size={16} className="mr-2" />Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onRemovePage(page) }} className="text-red-600"><Trash2 size={16} className="mr-2" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </button>
  )
}

function getVariantIssue(page: any, pages: any[]) {
  const sourceUuid = page?.content?.variants?.source?.page_uuid
  if (!page?.content?.variants) return ''
  if (!sourceUuid) return 'Variant page needs a source question'
  const sourcePage = pages.find((item) => item.page_uuid === sourceUuid)
  if (!sourcePage || !findQuestionBlock(sourcePage)) return 'Variant source question is missing'
  if (Number(sourcePage.order) >= Number(page.order)) return 'Variant source must come before this page'
  return ''
}
