'use client'

import React from 'react'
import { Check, ChevronDown, GitBranch, GripVertical, Link2, Plus, Trash2, X } from 'lucide-react'
import { findQuestionBlocks } from '@components/Learning/schema'

type FlowNode = { id: string; type: 'page' | 'complete'; page_uuid?: string }
type FlowEdge = { from: string; to: string; priority: number; condition?: any }
type Flow = { version: 1; entry: string; nodes: FlowNode[]; edges: FlowEdge[] }
type Point = { x: number; y: number }

const CARD_W = 190
const CARD_H = 84
const GAP_X = 115
const GAP_Y = 92

function outgoing(flow: Flow, nodeId: string) {
  return flow.edges.filter((edge) => edge.from === nodeId).sort((a, b) => b.priority - a.priority)
}

function incoming(flow: Flow, nodeId: string) {
  return flow.edges.filter((edge) => edge.to === nodeId)
}

function canReach(flow: Flow, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  return outgoing(flow, from).some((edge) => canReach(flow, edge.to, target, seen))
}

function reachableNodeIds(entry: string, edges: FlowEdge[]) {
  const seen = new Set<string>()
  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    edges.filter((edge) => edge.from === id).forEach((edge) => visit(edge.to))
  }
  visit(entry)
  return seen
}

function layoutFlow(flow: Flow): { positions: Record<string, Point>; width: number; height: number } {
  const ranks: Record<string, number> = { [flow.entry]: 0 }
  const queue = [flow.entry]
  while (queue.length) {
    const id = queue.shift()!
    outgoing(flow, id).forEach((edge) => {
      const next = Math.max(ranks[edge.to] ?? 0, (ranks[id] ?? 0) + 1)
      if (next !== ranks[edge.to]) {
        ranks[edge.to] = next
        queue.push(edge.to)
      }
    })
  }
  const rows: Record<string, number> = { [flow.entry]: 0 }
  let nextRow = 1
  const visit = (id: string) => {
    const edges = outgoing(flow, id)
    edges.forEach((edge, index) => {
      if (rows[edge.to] === undefined) rows[edge.to] = index === 0 ? rows[id] : nextRow++
      visit(edge.to)
    })
  }
  visit(flow.entry)
  // Merge nodes sit between their incoming paths.
  Object.keys(ranks).sort((a, b) => (ranks[a] ?? 0) - (ranks[b] ?? 0)).forEach((id) => {
    const parents = incoming(flow, id)
    if (parents.length > 1) rows[id] = parents.reduce((sum, edge) => sum + (rows[edge.from] ?? 0), 0) / parents.length
  })
  const positions: Record<string, Point> = {}
  Object.keys(ranks).forEach((id) => {
    positions[id] = { x: 60 + ranks[id] * (CARD_W + GAP_X), y: 54 + (rows[id] ?? 0) * (CARD_H + GAP_Y) }
  })
  return {
    positions,
    width: Math.max(760, ...Object.values(positions).map((point) => point.x + CARD_W + 80)),
    height: Math.max(360, ...Object.values(positions).map((point) => point.y + CARD_H + 100)),
  }
}

function curve(from: Point, to: Point) {
  const startX = from.x + CARD_W
  const startY = from.y + CARD_H / 2
  const endX = to.x
  const endY = to.y + CARD_H / 2
  const bend = Math.max(44, (endX - startX) * 0.45)
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
}

function questionSources(pages: any[]) {
  return pages.flatMap((page) => findQuestionBlocks(page).map((block: any) => {
    const isChoice = ['multiple_choice', 'categorized_multi_select'].includes(block.kind)
    return {
      value: `${page.page_uuid}.result.questions.${block.id}.${isChoice ? 'option_ids' : 'text'}`,
      label: `${page.title} — ${block.content?.label || 'Question'}`,
      kind: block.kind,
      options: isChoice ? (block.content?.options || []).map((option: any) => ({ value: String(option.id), label: String(option.text || option.label || option.id) })) : [],
    }
  }))
}

export function createLinearFlow(pages: any[]): Flow {
  const nodes: FlowNode[] = pages.map((page) => ({ id: `page:${page.page_uuid}`, type: 'page', page_uuid: page.page_uuid }))
  nodes.push({ id: 'complete', type: 'complete' })
  return {
    version: 1,
    entry: nodes[0]?.id || 'complete',
    nodes,
    edges: pages.map((page, index) => ({ from: `page:${page.page_uuid}`, to: index + 1 < pages.length ? `page:${pages[index + 1].page_uuid}` : 'complete', priority: 0 })),
  }
}

export default function VisualFlowEditor({ flow, pages, onChange, onSelectPage }: { flow: Flow; pages: any[]; onChange: (flow: Flow) => void; onSelectPage: (pageUuid: string) => void }) {
  const [activeDecision, setActiveDecision] = React.useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = React.useState<string | null>(null)
  const [pointer, setPointer] = React.useState<Point | null>(null)
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const decisionPanelRef = React.useRef<HTMLDivElement | null>(null)
  const { positions, width, height } = React.useMemo(() => layoutFlow(flow), [flow])
  const pageByUuid = React.useMemo(() => new Map(pages.map((page) => [page.page_uuid, page])), [pages])
  const sources = React.useMemo(() => questionSources(pages), [pages])
  const nodeById = React.useMemo(() => new Map(flow.nodes.map((node) => [node.id, node])), [flow.nodes])

  React.useEffect(() => {
    if (!activeDecision) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!decisionPanelRef.current?.contains(event.target as Node)) setActiveDecision(null)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
  }, [activeDecision])

  const replaceFlow = (patch: Partial<Flow>) => onChange({ ...flow, ...patch })
  const splitAt = (edge: FlowEdge) => {
    const siblings = outgoing(flow, edge.from)
    if (siblings.length > 1) { setActiveDecision(edge.from); return }
    const nextPriority = Math.max(1, ...siblings.map((item) => item.priority + 1))
    const terminalId = `complete:${Date.now()}`
    replaceFlow({
      nodes: [...flow.nodes, { id: terminalId, type: 'complete' }],
      edges: [...flow.edges, { from: edge.from, to: terminalId, priority: nextPriority, condition: { op: 'contains', left: { source: 'answer', key: sources[0]?.value || '' }, right: '' } }],
    })
    setActiveDecision(edge.from)
  }

  const updateDecisionEdge = (edge: FlowEdge, patch: Partial<FlowEdge>) => replaceFlow({
    edges: flow.edges.map((item) => item === edge ? { ...item, ...patch } : item),
  })
  const updateDecisionSource = (nodeId: string, key: string) => {
    const branches = outgoing(flow, nodeId)
    const defaultEdge = branches[branches.length - 1]
    replaceFlow({ edges: flow.edges.map((edge) => {
      if (edge.from !== nodeId) return edge
      if (edge === defaultEdge) return { ...edge, condition: undefined, priority: 0 }
      return { ...edge, condition: { op: 'contains', left: { source: 'answer', key }, right: edge.condition?.right || '' } }
    }) })
  }
  const addDecisionPath = (nodeId: string) => {
    const branches = outgoing(flow, nodeId)
    const terminalId = `complete:${Date.now()}`
    const sourceKey = branches.find((edge) => edge.condition)?.condition?.left?.key || sources[0]?.value || ''
    replaceFlow({
      nodes: [...flow.nodes, { id: terminalId, type: 'complete' }],
      edges: [...flow.edges, { from: nodeId, to: terminalId, priority: Math.max(1, ...branches.map((edge) => edge.priority + 1)), condition: { op: 'contains', left: { source: 'answer', key: sourceKey }, right: '' } }],
    })
  }

  const removeDecision = (nodeId: string) => {
    const branches = outgoing(flow, nodeId)
    if (branches.length < 2) return
    const ordered: string[] = []
    const seen = new Set<string>([nodeId, 'complete'])
    const collect = (id: string) => {
      if (seen.has(id)) return
      seen.add(id)
      const node = nodeById.get(id)
      if (node?.type === 'page') ordered.push(id)
      outgoing(flow, id).forEach((edge) => collect(edge.to))
    }
    branches.forEach((edge) => collect(edge.to))
    const removed = new Set(flow.edges.filter((edge) => edge.from === nodeId || ordered.includes(edge.from)).map((edge) => edge))
    const linearEdges: FlowEdge[] = ordered.length
      ? [{ from: nodeId, to: ordered[0], priority: 0 }, ...ordered.map((id, index) => ({ from: id, to: ordered[index + 1] || 'complete', priority: 0 }))]
      : [{ from: nodeId, to: 'complete', priority: 0 }]
    const nextEdges = [...flow.edges.filter((edge) => !removed.has(edge)), ...linearEdges]
    const reachable = reachableNodeIds(flow.entry, nextEdges)
    replaceFlow({ nodes: flow.nodes.filter((node) => reachable.has(node.id)), edges: nextEdges })
    setActiveDecision(null)
  }

  const swapPages = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const dragged = nodeById.get(draggedId)
    const target = nodeById.get(targetId)
    if (dragged?.type !== 'page' || target?.type !== 'page') return
    replaceFlow({ nodes: flow.nodes.map((node) => node.id === draggedId ? { ...node, page_uuid: target.page_uuid } : node.id === targetId ? { ...node, page_uuid: dragged.page_uuid } : node) })
  }

  const moveBeforeTerminal = (draggedId: string, terminalId: string) => {
    const dragged = nodeById.get(draggedId)
    if (dragged?.type !== 'page' || canReach(flow, terminalId, draggedId)) return
    const oldIncoming = incoming(flow, draggedId)
    const oldOutgoing = outgoing(flow, draggedId)
    if (oldOutgoing.length !== 1) return
    const oldNext = oldOutgoing[0].to
    const terminalIncoming = incoming(flow, terminalId)
    if (!terminalIncoming.length || terminalIncoming.some((edge) => edge.from === draggedId)) return
    const removed = new Set([...oldIncoming, ...oldOutgoing, ...terminalIncoming])
    const repaired = oldIncoming.map((edge) => ({ ...edge, to: oldNext }))
    const inserted = terminalIncoming.map((edge) => ({ ...edge, to: draggedId }))
    replaceFlow({ edges: [...flow.edges.filter((edge) => !removed.has(edge)), ...repaired, ...inserted, { from: draggedId, to: terminalId, priority: 0 }] })
  }

  const connect = (targetId: string) => {
    if (!connectingFrom || connectingFrom === targetId || canReach(flow, targetId, connectingFrom)) return
    const nextEdges = flow.edges.map((edge) => edge.from === connectingFrom && nodeById.get(edge.to)?.type === 'complete' ? { ...edge, to: targetId } : edge)
    const reachable = reachableNodeIds(flow.entry, nextEdges)
    replaceFlow({ nodes: flow.nodes.filter((node) => reachable.has(node.id)), edges: nextEdges })
    setConnectingFrom(null)
    setPointer(null)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!connectingFrom || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    setPointer({ x: event.clientX - rect.left + canvasRef.current.scrollLeft, y: event.clientY - rect.top + canvasRef.current.scrollTop })
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
      <div><div className="flex items-center gap-2"><GitBranch size={17}/><h2 className="text-sm font-bold">Learner paths</h2></div><p className="mt-0.5 text-xs text-gray-500">Drag pages to rearrange paths. Add a split from any connector; join an ending path by drawing it into a merge point.</p></div>
      {connectingFrom && <button onClick={() => { setConnectingFrom(null); setPointer(null) }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-bold text-gray-600"><X size={13}/> Cancel connection</button>}
    </div>
    <div ref={canvasRef} onPointerMove={onPointerMove} className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,#d1d5db_1px,transparent_0)] [background-size:20px_20px]">
      <div className="relative" style={{ width, height }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {flow.edges.map((edge, index) => {
            const from = positions[edge.from], to = positions[edge.to]
            if (!from || !to) return null
            const decision = outgoing(flow, edge.from).length > 1
            return <path key={`${edge.from}-${edge.to}-${index}`} d={curve(from, to)} fill="none" stroke={decision ? '#8b5cf6' : '#cbd5e1'} strokeWidth={decision ? 2.5 : 2}/>
          })}
          {connectingFrom && pointer && positions[connectingFrom] && <path d={`M ${positions[connectingFrom].x + CARD_W} ${positions[connectingFrom].y + CARD_H / 2} C ${positions[connectingFrom].x + CARD_W + 80} ${positions[connectingFrom].y + CARD_H / 2}, ${pointer.x - 80} ${pointer.y}, ${pointer.x} ${pointer.y}`} fill="none" stroke="#111827" strokeDasharray="7 5" strokeWidth="2"/>}
        </svg>

        {flow.edges.map((edge, index) => {
          const from = positions[edge.from], to = positions[edge.to]
          if (!from || !to || outgoing(flow, edge.from).length > 1 || nodeById.get(edge.to)?.type !== 'page') return null
          return <button key={`split-${edge.from}-${index}`} onClick={() => splitAt(edge)} title="Add a path option here" className="absolute z-20 flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm transition hover:scale-110 hover:border-violet-400 hover:text-violet-700" style={{ left: (from.x + CARD_W + to.x) / 2 - 14, top: (from.y + to.y) / 2 + CARD_H / 2 - 14 }}><Plus size={14}/></button>
        })}

        {flow.nodes.map((node) => {
          const point = positions[node.id]
          if (!point) return null
          const branches = outgoing(flow, node.id)
          const page = node.page_uuid ? pageByUuid.get(node.page_uuid) : null
          if (node.type === 'complete') return <div key={node.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveBeforeTerminal(event.dataTransfer.getData('text/flow-node'), node.id)} className="absolute flex h-[84px] w-[190px] items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/90 text-center" style={{ left: point.x, top: point.y }}><div><Check size={18} className="mx-auto text-emerald-700"/><p className="mt-1 text-xs font-bold text-emerald-800">Activity ends</p><p className="mt-1 text-[10px] text-emerald-700">Drop a page to extend</p></div></div>
          return <React.Fragment key={node.id}>
            <button
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/flow-node', node.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => swapPages(event.dataTransfer.getData('text/flow-node'), node.id)}
              onClick={() => page && onSelectPage(page.page_uuid)}
              className="group absolute z-10 flex h-[84px] w-[190px] cursor-grab items-start gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-md active:cursor-grabbing"
              style={{ left: point.x, top: point.y }}
            >
              <GripVertical size={15} className="mt-1 shrink-0 text-gray-300 group-hover:text-gray-500"/>
              <span className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Page {Math.max(1, pages.findIndex((item) => item.page_uuid === node.page_uuid) + 1)}</span><span className="mt-1 block line-clamp-2 text-sm font-bold text-gray-900">{page?.title || 'Missing page'}</span></span>
            </button>
            {incoming(flow, node.id).length > 1 || connectingFrom ? <button onClick={(event) => { event.stopPropagation(); connect(node.id) }} title="Merge a path here" className={`absolute z-30 h-4 w-4 -translate-x-1/2 rounded-full border-2 bg-white ${connectingFrom && !canReach(flow, node.id, connectingFrom) ? 'border-gray-950 ring-4 ring-gray-950/10' : 'border-gray-300'}`} style={{ left: point.x, top: point.y + CARD_H / 2 }}/>: null}
            {branches.length > 1 && <button onClick={() => setActiveDecision(activeDecision === node.id ? null : node.id)} className="absolute z-30 inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-800 shadow-sm" style={{ left: point.x + CARD_W + 22, top: point.y + CARD_H / 2 - 16 }}><GitBranch size={13}/> {branches.length} paths <ChevronDown size={12}/></button>}
            {branches.length === 1 && nodeById.get(branches[0].to)?.type === 'complete' && <button onClick={(event) => { event.stopPropagation(); setConnectingFrom(node.id) }} title="Draw a merge connection" className="absolute z-30 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm hover:border-gray-950 hover:text-gray-950" style={{ left: point.x + CARD_W - 3, top: point.y + CARD_H / 2 - 12 }}><Link2 size={12}/></button>}
          </React.Fragment>
        })}

        {activeDecision && positions[activeDecision] && <DecisionPanel panelRef={decisionPanelRef} nodeId={activeDecision} flow={flow} pages={pages} sources={sources} position={positions[activeDecision]} onClose={() => setActiveDecision(null)} onUpdateEdge={updateDecisionEdge} onSetSource={(key: string) => updateDecisionSource(activeDecision, key)} onAddPath={() => addDecisionPath(activeDecision)} onRemove={() => removeDecision(activeDecision)}/>} 
      </div>
    </div>
  </div>
}

function DecisionPanel({ panelRef, nodeId, flow, pages, sources, position, onClose, onUpdateEdge, onSetSource, onAddPath, onRemove }: any) {
  const edges = outgoing(flow, nodeId)
  const source = edges.find((edge) => edge.condition)?.condition?.left?.key || ''
  const selectedSource = sources.find((item: any) => item.value === source)
  return <div ref={panelRef} className="absolute z-40 w-[330px] rounded-2xl border border-violet-200 bg-white p-4 shadow-xl shadow-violet-950/10" style={{ left: position.x + CARD_W + 68, top: Math.max(14, position.y - 45) }}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">Decision point</p><p className="mt-1 text-xs leading-5 text-gray-500">Match each path to a question value. The default path catches everything else.</p></div><button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={15}/></button></div>
    <label className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Linked question<select value={source} onChange={(event) => onSetSource(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-2 text-xs font-semibold normal-case text-gray-800"><option value="">Choose a question</option>{sources.map((item: any) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <div className="mt-4 space-y-2">{edges.map((edge, index) => {
      const target = flow.nodes.find((node: any) => node.id === edge.to)
      const page = pages.find((item: any) => item.page_uuid === target?.page_uuid)
      const isDefault = !edge.condition
      return <div key={`${edge.from}-${edge.to}-${index}`} className="rounded-xl border border-gray-200 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold">{page?.title || 'Activity ends'}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${isDefault ? 'bg-gray-100 text-gray-600' : 'bg-violet-50 text-violet-700'}`}>{isDefault ? 'Default' : `Path ${index + 1}`}</span></div>{!isDefault && (selectedSource?.options?.length ? <select value={edge.condition?.right || ''} onChange={(event) => onUpdateEdge(edge, { condition: { ...edge.condition, left: { source: 'answer', key: source }, right: event.target.value } })} className="mt-2 h-8 w-full rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-violet-400"><option value="">Choose an answer</option>{selectedSource.options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input value={edge.condition?.right || ''} onChange={(event) => onUpdateEdge(edge, { condition: { ...edge.condition, left: { source: 'answer', key: source }, right: event.target.value } })} placeholder="Answer value" className="mt-2 h-8 w-full rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-violet-400"/>)}</div>
    })}</div>
    <button onClick={onAddPath} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-violet-200 text-xs font-bold text-violet-700 hover:bg-violet-50"><Plus size={13}/> Add another path</button>
    <button onClick={onRemove} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={13}/> Remove decision and keep its pages</button>
  </div>
}
