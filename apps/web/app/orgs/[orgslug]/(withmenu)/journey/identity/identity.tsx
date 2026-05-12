'use client'

import { PointerEvent, WheelEvent, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  Compass,
  Heart,
  Home,
  Lightbulb,
  Move,
  Route,
  Sparkles,
  Sprout,
  Star,
  Target,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Button } from '@components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  FrameworkNode,
  IdentityNodeDetail,
  getIdentityFramework,
  getIdentityNodeDetail,
} from '@services/identity/identity'

type CanvasPoint = { x: number; y: number }
type CanvasNode = CanvasPoint & { node: FrameworkNode; radius: number; layer: 'domain' | 'category' }
type ViewState = { x: number; y: number; scale: number }

const MIN_SCALE = 0.55
const MAX_SCALE = 1.8
const MAP_BOUNDS = { minX: -560, maxX: 560, minY: -390, maxY: 390 }

function stateLabel(state?: string) {
  if (!state) return 'Empty'
  return state.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function constrainView(view: ViewState, rect?: DOMRect | null) {
  if (!rect) return view

  const originX = rect.width / 2
  const originY = rect.height / 2
  const margin = 120
  const minX = margin - originX - MAP_BOUNDS.maxX * view.scale
  const maxX = rect.width - margin - originX - MAP_BOUNDS.minX * view.scale
  const minY = margin - originY - MAP_BOUNDS.maxY * view.scale
  const maxY = rect.height - margin - originY - MAP_BOUNDS.minY * view.scale

  return {
    ...view,
    x: clamp(view.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(view.y, Math.min(minY, maxY), Math.max(minY, maxY)),
  }
}

function flattenNodes(nodes: FrameworkNode[]) {
  const flat: FrameworkNode[] = []
  const visit = (node: FrameworkNode) => {
    flat.push(node)
    ;(node.children || []).forEach(visit)
  }
  nodes.forEach(visit)
  return flat
}

function evidenceSummary(node: FrameworkNode) {
  const pieces = []
  if (node.insight_count) pieces.push(`${node.insight_count} insight${node.insight_count === 1 ? '' : 's'}`)
  if (node.evidence_count) pieces.push(`${node.evidence_count} evidence`)
  return pieces.length ? pieces.join(' / ') : 'Ready to explore'
}

function nodeTone(state?: string) {
  switch (state) {
    case 'developed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-emerald-100'
    case 'emerging':
      return 'border-sky-300 bg-sky-50 text-sky-700 shadow-sky-100'
    case 'started':
      return 'border-amber-300 bg-amber-50 text-amber-700 shadow-amber-100'
    case 'stale':
      return 'border-gray-300 bg-gray-100 text-gray-500 shadow-gray-100'
    default:
      return 'border-dashed border-gray-300 bg-white text-gray-500 shadow-gray-100'
  }
}

function nodeIcon(node: FrameworkNode) {
  if (node.key === 'inner_world') return Heart
  if (node.key === 'outer_world') return Route
  if (node.key.includes('dreams_ambitions')) return Target
  if (node.key.includes('hobbies_interests')) return Star
  if (node.key.includes('culture_values')) return Sprout
  if (node.key.includes('mind')) return Brain
  if (node.key.includes('body')) return Activity
  if (node.key.includes('inner_compass')) return Compass
  if (node.key.includes('executive_function')) return Compass
  if (node.key.includes('daily_living')) return Home
  if (node.key.includes('relational')) return Users
  if (node.key.includes('interest_based')) return Sparkles
  if (node.key.includes('academic')) return BookOpen
  return Sparkles
}

function buildCanvasNodes(roots: FrameworkNode[]): CanvasNode[] {
  const inner = roots.find((node) => node.key === 'inner_world')
  const outer = roots.find((node) => node.key === 'outer_world')
  const nodes: CanvasNode[] = []
  const innerRing: FrameworkNode[] = []
  const outerRing: FrameworkNode[] = []

  if (inner) {
    nodes.push({ node: inner, x: -180, y: 0, radius: 54, layer: 'domain' })
    innerRing.push(...(inner.children || []).flatMap((category) => category.children || []))
  }

  if (outer) {
    nodes.push({ node: outer, x: 180, y: 0, radius: 54, layer: 'domain' })
    outerRing.push(...(outer.children || []))
  }

  innerRing.forEach((node, index) => {
    const angle = 120 + (120 / Math.max(innerRing.length - 1, 1)) * index
    const radians = (angle * Math.PI) / 180
    nodes.push({
      node,
      x: Math.cos(radians) * 470,
      y: Math.sin(radians) * 300,
      radius: 42,
      layer: 'category',
    })
  })

  outerRing.forEach((node, index) => {
    const angle = -60 + (120 / Math.max(outerRing.length - 1, 1)) * index
    const radians = (angle * Math.PI) / 180
    nodes.push({
      node,
      x: Math.cos(radians) * 470,
      y: Math.sin(radians) * 300,
      radius: 42,
      layer: 'category',
    })
  })

  return nodes
}

function CanvasNodeButton({
  item,
  selected,
  onSelect,
}: {
  item: CanvasNode
  selected: boolean
  onSelect: (item: CanvasNode) => void
}) {
  const Icon = nodeIcon(item.node)

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center outline-hidden"
      style={{ left: item.x, top: item.y, width: item.layer === 'domain' ? 152 : 132 }}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full border-2 shadow-lg transition duration-200 hover:-translate-y-1 hover:shadow-xl',
          nodeTone(item.node.development_state),
          selected && 'ring-4 ring-gray-950 ring-offset-4',
          item.layer === 'domain' && 'h-[108px] w-[108px]',
          item.layer === 'category' && 'h-[82px] w-[82px]'
        )}
      >
        <Icon className={cn(item.layer === 'domain' ? 'h-9 w-9' : 'h-7 w-7')} />
      </span>
      <span className="rounded-md bg-white/90 px-2 py-1 shadow-xs">
        <span className="block text-sm font-semibold leading-4 text-gray-950">{item.node.title}</span>
        <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
          {stateLabel(item.node.development_state)}
        </span>
      </span>
    </button>
  )
}

function CanvasLine({ from, to }: { from: CanvasPoint; to: CanvasPoint }) {
  const pad = 4
  const left = Math.min(from.x, to.x) - pad
  const top = Math.min(from.y, to.y) - pad
  const width = Math.abs(from.x - to.x)
  const height = Math.abs(from.y - to.y)

  return (
    <svg className="pointer-events-none absolute overflow-visible" style={{ left, top, width: width + pad * 2, height: height + pad * 2 }}>
      <line
        x1={from.x - left}
        y1={from.y - top}
        x2={to.x - left}
        y2={to.y - top}
        stroke="rgba(75, 85, 99, 0.22)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CanvasRing({ radiusX, radiusY }: { radiusX: number; radiusY: number }) {
  return (
    <svg
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 overflow-visible"
      style={{ left: 0, top: 0, width: radiusX * 2, height: radiusY * 2 }}
    >
      <ellipse
        cx={radiusX}
        cy={radiusY}
        rx={radiusX}
        ry={radiusY}
        fill="none"
        stroke="rgba(75, 85, 99, 0.14)"
        strokeDasharray="8 12"
        strokeWidth="2"
      />
    </svg>
  )
}

function IdentityCanvas({
  roots,
  selectedKey,
  onSelect,
}: {
  roots: FrameworkNode[]
  selectedKey: string | null
  onSelect: (item: CanvasNode) => void
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [view, setView] = useState<ViewState>({ x: 0, y: 10, scale: 1 })
  const [isAnimating, setIsAnimating] = useState(false)
  const canvasNodes = useMemo(() => buildCanvasNodes(roots), [roots])
  const nodeByKey = useMemo(() => new Map(canvasNodes.map((item) => [item.node.key, item])), [canvasNodes])

  const focusNode = (item: CanvasNode) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
    const scale = Math.max(view.scale, 1)
    const targetX = rect ? (isMobile ? rect.width / 2 : Math.max(260, (rect.width - 460) / 2)) : 360
    const targetY = rect ? (isMobile ? Math.max(190, rect.height * 0.26) : rect.height / 2) : 260
    const originX = rect ? rect.width / 2 : 0
    const originY = rect ? rect.height / 2 : 0
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
    setIsAnimating(true)
    setView(constrainView({ scale, x: targetX - originX - item.x * scale, y: targetY - originY - item.y * scale }, rect))
    animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 520)
    onSelect(item)
  }

  const zoomBy = (delta: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const centerX = 0
    const centerY = 0
    setView((current) => {
      const nextScale = clamp(current.scale + delta, MIN_SCALE, MAX_SCALE)
      const ratio = nextScale / current.scale
      return constrainView({
        scale: nextScale,
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
      }, rect)
    })
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const cursorX = event.clientX - rect.left - rect.width / 2
    const cursorY = event.clientY - rect.top - rect.height / 2
    setView((current) => {
      const nextScale = clamp(current.scale - event.deltaY * 0.001, MIN_SCALE, MAX_SCALE)
      const ratio = nextScale / current.scale
      return constrainView({
        scale: nextScale,
        x: cursorX - (cursorX - current.x) * ratio,
        y: cursorY - (cursorY - current.y) * ratio,
      }, rect)
    })
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    const rect = viewportRef.current?.getBoundingClientRect()
    setView((current) => constrainView({ ...current, x: current.x + dx, y: current.y + dy }, rect))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null
  }

  const center: CanvasPoint = { x: 0, y: 0 }
  const innerDomain = canvasNodes.find((item) => item.node.key === 'inner_world')
  const outerDomain = canvasNodes.find((item) => item.node.key === 'outer_world')
  const lines = canvasNodes.flatMap((item) => {
    if (item.layer === 'domain') return [{ from: center, to: item }]
    const parent = item.node.key.startsWith('inner_world') ? innerDomain : outerDomain
    return parent ? [{ from: parent, to: item }] : []
  })

  return (
    <div
      ref={viewportRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-full min-h-[640px] touch-none overflow-hidden bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.94),rgba(249,250,251,0.86)),linear-gradient(to_right,rgba(17,24,39,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.05)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px]"
    >
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-sm">
        <div className="flex items-center gap-2 px-2 text-xs font-medium text-gray-500">
        <Move className="h-4 w-4" />
        Drag to move
        </div>
        <button type="button" onClick={() => zoomBy(-0.15)} className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => zoomBy(0.15)} className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      <div
        className={cn(
          'absolute left-1/2 top-1/2 h-[1px] w-[1px] origin-top-left',
          isAnimating && 'transition-transform duration-500 ease-out'
        )}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <CanvasRing radiusX={230} radiusY={126} />
        <CanvasRing radiusX={470} radiusY={300} />
        {lines.map((line, index) => (
          <CanvasLine key={`${line.from.x}:${line.from.y}:${line.to.x}:${line.to.y}:${index}`} from={line.from} to={line.to} />
        ))}
        <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center">
          <div className="flex h-[118px] w-[118px] items-center justify-center rounded-full border-2 border-gray-950 bg-white text-gray-950 shadow-xl">
            <Sparkles className="h-10 w-10" />
          </div>
          <div className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-gray-950 shadow-xs">Self</div>
        </div>
        {canvasNodes.map((item) => (
          <CanvasNodeButton
            key={item.node.key}
            item={item}
            selected={selectedKey === item.node.key}
            onSelect={focusNode}
          />
        ))}
      </div>

      {selectedKey && nodeByKey.has(selectedKey) ? (
        <div className="pointer-events-none absolute right-5 top-5 hidden rounded-lg bg-white/80 px-3 py-2 text-xs font-medium text-gray-500 shadow-sm lg:block">
          {nodeByKey.get(selectedKey)?.node.title}
        </div>
      ) : null}
    </div>
  )
}

function SuggestedCarousel({ detail, orgslug }: { detail?: IdentityNodeDetail; orgslug: string }) {
  const items = detail?.tagged_content || []

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
        Suggested resources will appear here when this section has connected content.
      </div>
    )
  }

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map((item) => {
        const isResource = item.content_type === 'resource'
        const card = (
          <div className="h-full min-w-[190px] rounded-lg border border-gray-200 bg-white p-3 shadow-xs transition hover:border-gray-300 hover:shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="line-clamp-2 text-sm font-medium leading-5 text-gray-950">{item.title}</div>
              {isResource ? <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-400" /> : null}
            </div>
            <div className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-gray-400">{item.intent}</div>
          </div>
        )

        return isResource ? (
          <Link
            key={`${item.content_type}:${item.content_uuid}`}
            href={getUriWithOrg(orgslug, routePaths.org.resource(item.content_uuid))}
          >
            {card}
          </Link>
        ) : (
          <div key={`${item.content_type}:${item.content_uuid}`}>{card}</div>
        )
      })}
    </div>
  )
}

function CompactInsightList({ detail }: { detail?: IdentityNodeDetail }) {
  const items = detail?.insights || []

  if (!items.length) {
    return <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No insights confirmed here yet.</p>
  }

  return (
    <div className="space-y-2">
      {items.map((insight) => (
        <div key={insight.insight_uuid} className="rounded-lg border border-gray-100 bg-white p-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-950">{insight.label}</div>
              {insight.summary ? <p className="mt-1 line-clamp-3 text-sm leading-6 text-gray-500">{insight.summary}</p> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CompactEvidenceList({ detail }: { detail?: IdentityNodeDetail }) {
  const items = detail?.evidence || []

  if (!items.length) {
    return <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No evidence captured for this section yet.</p>
  }

  return (
    <div className="space-y-2">
      {items.map((entry) => (
        <div key={entry.entry_uuid} className="rounded-lg border border-gray-100 bg-white p-3">
          <div className="flex items-start gap-2">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-950">{entry.title}</div>
              {entry.body ? <p className="mt-1 line-clamp-3 text-sm leading-6 text-gray-500">{entry.body}</p> : null}
              <div className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-gray-400">
                {entry.source_type.replaceAll('_', ' ')}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChildNodeCards({ node, onSelect }: { node: FrameworkNode; onSelect: (node: FrameworkNode) => void }) {
  if (!node.children?.length) return null

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-950">Inside this area</h3>
      <div className="grid gap-2">
        {node.children.map((child) => {
          const Icon = nodeIcon(child)
          return (
            <button
              key={child.key}
              type="button"
              onClick={() => onSelect(child)}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-gray-300 hover:bg-gray-50"
            >
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border', nodeTone(child.development_state))}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-950">{child.title}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-500">{evidenceSummary(child)}</span>
              </span>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-gray-300" />
            </button>
          )
        })}
      </div>
    </section>
  )
}

function DetailPanel({
  node,
  detail,
  isLoading,
  orgslug,
  onClose,
  onSelectNode,
  className,
}: {
  node: FrameworkNode
  detail?: IdentityNodeDetail
  isLoading: boolean
  orgslug: string
  onClose: () => void
  onSelectNode: (node: FrameworkNode) => void
  className?: string
}) {
  const profileSummary = detail?.profile?.summary
  const confidence = detail?.profile?.user_confidence
  const isDomain = node.node_type === 'domain'

  return (
    <aside
      className={cn(
        'pointer-events-auto z-max flex h-full min-h-0 flex-col rounded-t-xl border border-gray-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] ring-1 ring-black/5 lg:rounded-lg',
        className
      )}
    >
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{stateLabel(node.development_state)}</div>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-gray-950">{node.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close identity details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          {profileSummary || node.description || 'Capture reflections and evidence here as this part of your profile becomes clearer.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-500">
          <span className="rounded-full bg-gray-100 px-2.5 py-1">{node.insight_count} insights</span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1">{node.evidence_count} evidence</span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1">{confidence ? `${confidence}/5 confidence` : 'No confidence rating'}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
          </div>
        ) : (
          <div className="space-y-5">
            {isDomain ? <ChildNodeCards node={node} onSelect={onSelectNode} /> : null}

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-950">Dive deeper</h3>
                <Sparkles className="h-4 w-4 text-gray-300" />
              </div>
              <SuggestedCarousel detail={detail} orgslug={orgslug} />
            </section>

            <Tabs defaultValue="insights" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="insights">Insights</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
              </TabsList>
              <TabsContent value="insights" className="mt-3">
                <CompactInsightList detail={detail} />
              </TabsContent>
              <TabsContent value="evidence" className="mt-3">
                <CompactEvidenceList detail={detail} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-4">
        <Button asChild variant="outline" className="w-full">
          <Link href={getUriWithOrg(orgslug, routePaths.org.journeyIdentityNode(node.key))}>
            Open full section
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </aside>
  )
}

export default function IdentityClient({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false)
  const [mobileHeaderExpanded, setMobileHeaderExpanded] = useState(false)
  const { data: roots = [], isLoading } = useSWR(
    orgId && accessToken ? ['identity-framework', orgId, accessToken] : null,
    () => getIdentityFramework(orgId, accessToken),
    { revalidateOnFocus: false }
  )
  const nodes = useMemo(() => flattenNodes(roots), [roots])
  const selectedNode = nodes.find((node) => node.key === selectedKey)
  const selectNode = (nodeKey: string | null) => {
    setSelectedKey(nodeKey)
    setMobilePanelExpanded(Boolean(nodeKey))
  }
  const { data: selectedDetail, isLoading: detailLoading } = useSWR(
    orgId && accessToken && selectedKey ? ['identity-node-preview', orgId, selectedKey, accessToken] : null,
    () => getIdentityNodeDetail(orgId, selectedKey as string, accessToken),
    { revalidateOnFocus: false }
  )

  return (
    <main className="relative h-screen min-h-[680px] overflow-hidden bg-gray-50 text-gray-950">
      <header className="pointer-events-none absolute left-4 right-4 top-4 z-30 hidden md:left-8 md:right-auto md:top-8 md:block md:w-[420px]">
        <div className="pointer-events-auto rounded-lg border border-gray-200 bg-white/92 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur-md">
          <div className="mb-3">
            <Link
              href={getUriWithOrg(orgslug, routePaths.org.journey())}
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-950"
            >
              <ArrowLeft className="h-4 w-4" />
              Journey
            </Link>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Journey</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">My Identity</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              A living map of what you are learning about yourself as you build toward launch.
            </p>
          </div>
        </div>
      </header>

      <header className="absolute left-3 right-3 top-3 z-30 md:hidden">
        <div className="rounded-lg border border-gray-200 bg-white/95 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
          <div className="flex items-center gap-3 p-3">
            <Link
              href={getUriWithOrg(orgslug, routePaths.org.journey())}
              className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
              aria-label="Back to journey"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Journey</div>
              <h1 className="truncate text-lg font-semibold tracking-tight text-gray-950">My Identity</h1>
            </div>
            <button
              type="button"
              onClick={() => setMobileHeaderExpanded((expanded) => !expanded)}
              className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 shadow-xs"
            >
              {mobileHeaderExpanded ? 'Hide' : 'About'}
            </button>
          </div>
          {mobileHeaderExpanded ? (
            <p className="border-t border-gray-100 px-3 pb-3 pt-2 text-sm leading-6 text-gray-600">
              A living map of what you are learning about yourself as you build toward launch.
            </p>
          ) : null}
        </div>
      </header>

      {isLoading ? (
        <div className="h-full animate-pulse bg-white" />
      ) : (
          <IdentityCanvas
            roots={roots}
            selectedKey={selectedKey}
            onSelect={(item) => selectNode(item.node.key)}
          />
      )}

      {selectedNode ? (
        <div className="pointer-events-none fixed inset-0 z-max hidden lg:block">
          <DetailPanel
            node={selectedNode}
            detail={selectedDetail}
            isLoading={detailLoading}
            orgslug={orgslug}
            onClose={() => selectNode(null)}
            onSelectNode={(node) => selectNode(node.key)}
            className="absolute bottom-8 right-8 top-8 w-[420px]"
          />
        </div>
      ) : null}

      {selectedNode && mobilePanelExpanded ? (
        <div className="fixed inset-0 z-max lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-transparent"
            aria-label="Close identity details"
            onClick={() => setMobilePanelExpanded(false)}
          />
          <DetailPanel
            node={selectedNode}
            detail={selectedDetail}
            isLoading={detailLoading}
            orgslug={orgslug}
            onClose={() => selectNode(null)}
            onSelectNode={(node) => selectNode(node.key)}
            className="absolute inset-x-3 bottom-3 h-[78vh] max-h-[78vh]"
          />
        </div>
      ) : null}
    </main>
  )
}
