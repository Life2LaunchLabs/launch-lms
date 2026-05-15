'use client'

import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  Activity,
  ArrowRight,
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
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Button } from '@components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory, getResourceThumbnailMediaDirectory } from '@services/media/media'
import {
  FrameworkNode,
  IdentityNodeDetail,
  getIdentityFramework,
  getIdentityNodeDetail,
} from '@services/identity/identity'
import { JourneyPanel, JourneyPanelCloseButton, JourneyWorkspaceHeader, JourneyWorkspaceShell } from '../workspace'

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

function stripKnownPrefix(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
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

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const handler = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
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
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

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

export function SuggestedCarousel({ detail, orgslug, orgUUID }: { detail?: IdentityNodeDetail; orgslug: string; orgUUID?: string }) {
  const items = (detail?.tagged_content || []).slice(0, 5)

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
        const isCourse = item.content_type === 'course'
        const ownerOrgUUID = item.owner_org_uuid || orgUUID
        const imageUrl =
          isResource && item.thumbnail_image && ownerOrgUUID
            ? getResourceThumbnailMediaDirectory(ownerOrgUUID, item.content_uuid, item.thumbnail_image)
            : isResource && item.cover_image_url
              ? item.cover_image_url
              : isCourse && item.thumbnail_image && ownerOrgUUID
                ? getCourseThumbnailMediaDirectory(ownerOrgUUID, item.content_uuid, item.thumbnail_image)
                : null
        const href = isResource
          ? routePaths.org.resource(stripKnownPrefix(item.content_uuid, 'resource_'))
          : isCourse
            ? routePaths.org.course(stripKnownPrefix(item.content_uuid, 'course_'))
            : null

        const card = (
          <div
            className="relative h-32 min-w-[190px] overflow-hidden rounded-lg border border-gray-200 bg-gray-950 shadow-xs transition hover:border-gray-300 hover:shadow-sm"
            style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/5" />
            <div className="relative flex h-full flex-col justify-end p-3">
              <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">{item.title}</div>
              <div className="mt-1 text-xs font-medium capitalize text-white/75">{item.content_type}</div>
            </div>
          </div>
        )

        return href ? (
          <Link
            key={`${item.content_type}:${item.content_uuid}`}
            href={getUriWithOrg(orgslug, href)}
            className="block"
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

export function CompactInsightList({ detail }: { detail?: IdentityNodeDetail }) {
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

export function CompactEvidenceList({ detail }: { detail?: IdentityNodeDetail }) {
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

export function DetailPanel({
  node,
  detail,
  isLoading,
  orgslug,
  orgUUID,
  onClose,
  onSelectNode,
  className,
}: {
  node: FrameworkNode
  detail?: IdentityNodeDetail
  isLoading: boolean
  orgslug: string
  orgUUID?: string
  onClose: () => void
  onSelectNode: (node: FrameworkNode) => void
  className?: string
}) {
  const profileSummary = detail?.profile?.summary
  const confidence = detail?.profile?.user_confidence
  const isDomain = node.node_type === 'domain'

  return (
    <JourneyPanel className={className}>
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{stateLabel(node.development_state)}</div>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-gray-950">{node.title}</h2>
          </div>
          <JourneyPanelCloseButton onClose={onClose} label="Close identity details" />
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
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                    <Link href={getUriWithOrg(orgslug, `${routePaths.org.resources()}?q=${encodeURIComponent(node.title)}`)}>
                      Resources
                    </Link>
                  </Button>
                </div>
              </div>
              <SuggestedCarousel detail={detail} orgslug={orgslug} orgUUID={orgUUID} />
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
    </JourneyPanel>
  )
}

export default function IdentityClient({ orgslug }: { orgslug: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const { data: roots = [], isLoading } = useSWR(
    orgId && accessToken ? ['identity-framework', orgId, accessToken] : null,
    () => getIdentityFramework(orgId, accessToken),
    { revalidateOnFocus: false }
  )
  const nodes = useMemo(() => flattenNodes(roots), [roots])
  const selectedNode = nodes.find((node) => node.key === selectedKey)
  const selectNode = (nodeKey: string | null) => {
    setSelectedKey(nodeKey)
  }
  const { data: selectedDetail, isLoading: detailLoading } = useSWR(
    orgId && accessToken && selectedKey ? ['identity-node-preview', orgId, selectedKey, accessToken] : null,
    () => getIdentityNodeDetail(orgId, selectedKey as string, accessToken),
    { revalidateOnFocus: false }
  )

  return (
    <JourneyWorkspaceShell
      header={(
        <JourneyWorkspaceHeader
          breadcrumbs={[
            { label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> },
            { label: 'Identity' },
          ]}
        />
      )}
      panelOpen={Boolean(selectedNode)}
      onPanelClose={() => selectNode(null)}
      mobilePanelLabel="Close identity details"
      panel={selectedNode ? (
        <DetailPanel
          node={selectedNode}
          detail={selectedDetail}
          isLoading={detailLoading}
          orgslug={orgslug}
          orgUUID={org?.org_uuid}
          onClose={() => selectNode(null)}
          onSelectNode={(node) => selectNode(node.key)}
        />
      ) : null}
    >
      {isLoading ? (
        <div className="h-full animate-pulse bg-white" />
      ) : (
          <IdentityCanvas
            roots={roots}
            selectedKey={selectedKey}
            onSelect={(item) => selectNode(item.node.key)}
          />
      )}
    </JourneyWorkspaceShell>
  )
}
