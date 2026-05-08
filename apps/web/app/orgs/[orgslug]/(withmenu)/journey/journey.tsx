'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  getSuggestedActionsUrl,
  recordSuggestedActionEvent,
  suggestedActionsFetcher,
  SuggestedAction,
} from '@services/suggested-actions/suggested-actions'
import { getIdentitySummary, IdentitySummary, FrameworkNode } from '@services/identity/identity'

type ActionCard = {
  id: string
  key: string
  url: string
  title: string
  subtext?: string | null
  imageUrl?: string | null
  textTone: 'dark' | 'light'
  metadata?: Record<string, unknown>
}

type JourneyClientProps = {
  displayName: string
  orgslug: string
}

const hexToRgba = (hex: string, alpha: number): string => {
  if (!hex || hex.length < 7) return 'white'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeUrl(url?: string) {
  if (!url) return '#'
  if (url.startsWith('/') || url.startsWith('#')) return url
  if (/^https?:\/\//i.test(url)) return url
  return `https://${url}`
}

function suggestedActionToCard(action: SuggestedAction): ActionCard {
  return {
    id: action.key,
    key: action.key,
    url: action.href,
    title: action.title,
    subtext: action.subtext,
    imageUrl: action.imageUrl,
    textTone: action.textTone === 'light' ? 'light' : 'dark',
    metadata: action.metadata,
  }
}

function ActionDisplayCard({
  card,
  elevation,
  orgslug,
  onClick,
}: {
  card: ActionCard
  elevation: number
  orgslug: string
  // eslint-disable-next-line no-unused-vars
  onClick?: (_card: ActionCard) => void
}) {
  const href = card.url.startsWith('/') ? getUriWithOrg(orgslug, card.url) : normalizeUrl(card.url)
  const bgClass = (['bg-white', 'bg-gray-100', 'bg-gray-200'] as const)[Math.min(elevation, 2)]
  const shadowClass = (['shadow-xl', 'shadow-lg', 'shadow-md'] as const)[Math.min(elevation, 2)]

  return (
    <div className={`flex h-[270px] w-[min(82vw,360px)] flex-col overflow-hidden rounded-[28px] p-6 text-left transition-colors duration-300 sm:h-[285px] sm:w-[380px] ${bgClass} ${shadowClass}`}>
      <h3 className="text-2xl font-black leading-tight text-gray-950">
        {card.title || 'Featured link'}
      </h3>
      <div className="mt-3 flex flex-1 items-stretch gap-4">
        <div className="flex flex-1 flex-col">
          {card.subtext ? (
            <p className="text-base leading-6 text-gray-500">{card.subtext}</p>
          ) : null}
          <div className="mt-auto">
            <a
              href={href}
              onClick={() => onClick?.(card)}
              className="inline-flex items-center rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Let&apos;s go!
            </a>
          </div>
        </div>
        {card.imageUrl ? (
          <div className="flex items-center">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl">
              <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ActionCarousel({
  cards,
  orgslug,
  onCardClick,
}: {
  cards: ActionCard[]
  orgslug: string
  // eslint-disable-next-line no-unused-vars
  onCardClick?: (_card: ActionCard) => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null)
  const gesture = useRef({ startX: 0, dragX: 0, active: false, activeIndex: 0 })
  const wasDragging = useRef(false)

  const SWIPE_THRESHOLD = 72

  const moveTo = (index: number) => {
    if (!cards.length) return
    const next = Math.max(0, Math.min(index, cards.length - 1))
    gesture.current.activeIndex = next
    setActiveIndex(next)
  }

  const navigateTo = (direction: 'prev' | 'next') => {
    const target = direction === 'next'
      ? gesture.current.activeIndex + 1
      : gesture.current.activeIndex - 1
    if (target < 0 || target >= cards.length) return
    setExitDirection(direction === 'next' ? 'left' : 'right')
    setTimeout(() => {
      setExitDirection(null)
      moveTo(target)
    }, 160)
  }

  const onDragStart = (clientX: number) => {
    if (exitDirection) return
    gesture.current.startX = clientX
    gesture.current.dragX = 0
    gesture.current.active = true
    setIsDragging(true)
  }

  const onDragMove = (clientX: number) => {
    if (!gesture.current.active) return
    let dx = clientX - gesture.current.startX
    if (
      (dx > 0 && gesture.current.activeIndex === 0) ||
      (dx < 0 && gesture.current.activeIndex === cards.length - 1)
    ) {
      dx = dx * 0.25
    }
    gesture.current.dragX = dx
    setDragX(dx)
  }

  const onDragEnd = () => {
    if (!gesture.current.active) return
    gesture.current.active = false
    setIsDragging(false)
    const dx = gesture.current.dragX
    wasDragging.current = Math.abs(dx) > 8
    if (dx < -SWIPE_THRESHOLD) {
      moveTo(gesture.current.activeIndex + 1)
    } else if (dx > SWIPE_THRESHOLD) {
      moveTo(gesture.current.activeIndex - 1)
    }
    gesture.current.dragX = 0
    setDragX(0)
  }

  const handleCardClick = (card: ActionCard) => {
    if (wasDragging.current) {
      wasDragging.current = false
      return
    }
    onCardClick?.(card)
  }

  return (
    <div className="relative flex flex-col items-center overflow-visible py-2">
      <div
        className="relative flex h-[290px] w-full items-center justify-center sm:h-[305px]"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => onDragMove(e.touches[0].clientX)}
        onTouchEnd={onDragEnd}
      >
        {cards.map((card, index) => {
          const offset = index - activeIndex
          if (Math.abs(offset) > 2) return null
          const active = offset === 0
          const activeDragging = active && isDragging
          const activeExiting = active && exitDirection !== null
          const activeTransform = (() => {
            if (activeExiting)
              return `translateX(${exitDirection === 'left' ? -280 : 280}px) rotate(${exitDirection === 'left' ? -5 : 5}deg) scale(1)`
            if (activeDragging)
              return `translateX(${dragX}px) rotate(${dragX * 0.03}deg) scale(1)`
            return 'translateX(0px) rotate(0deg) scale(1)'
          })()
          return (
            <div
              key={`card-${card.id}`}
              className="absolute"
              style={{
                transform: active
                  ? activeTransform
                  : `translateX(${offset * 25}px) translateY(${Math.abs(offset) * 10}px) scale(${1 - Math.abs(offset) * 0.04})`,
                zIndex: 10 - Math.abs(offset),
                transition: activeDragging ? 'none' : active && activeExiting ? 'transform 220ms ease-in' : 'transform 300ms ease',
              }}
            >
              <ActionDisplayCard card={card} elevation={Math.abs(offset)} orgslug={orgslug} onClick={handleCardClick} />
            </div>
          )
        })}
        {cards.length > 1 ? (
          <>
            {activeIndex > 0 && (
              <button
                type="button"
                aria-label="Previous featured card"
                onClick={() => navigateTo('prev')}
                className="absolute left-1/2 z-30 hidden h-11 w-11 -translate-x-[250px] items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md hover:bg-white sm:flex"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {activeIndex < cards.length - 1 && (
              <button
                type="button"
                aria-label="Next featured card"
                onClick={() => navigateTo('next')}
                className="absolute right-1/2 z-30 hidden h-11 w-11 translate-x-[250px] items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md hover:bg-white sm:flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </>
        ) : null}
      </div>
      {cards.length > 1 ? (
        <div className="mt-3 flex items-center justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-2 backdrop-blur-sm">
            {cards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                aria-label={`Show featured card ${index + 1}`}
                onClick={() => moveTo(index)}
                className={`h-2 rounded-full bg-white transition-all duration-300 ${
                  index === activeIndex ? 'w-5' : 'w-2 opacity-50'
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ActionCarouselSkeleton() {
  return (
    <div className="relative hidden h-[305px] w-full items-center justify-center sm:flex">
      <div className="h-[285px] w-[380px] animate-pulse rounded-[28px] border border-white/60 bg-white/50" />
      <div className="absolute h-[250px] w-[330px] -translate-x-[120px] animate-pulse rounded-[28px] border border-white/40 bg-white/25" />
      <div className="absolute h-[250px] w-[330px] translate-x-[120px] animate-pulse rounded-[28px] border border-white/40 bg-white/25" />
    </div>
  )
}

function findNode(summary: IdentitySummary | undefined, key: string): FrameworkNode | undefined {
  const visit = (node: FrameworkNode): FrameworkNode | undefined => {
    if (node.key === key) return node
    for (const child of node.children || []) {
      const found = visit(child)
      if (found) return found
    }
    return undefined
  }
  for (const root of summary?.roots || []) {
    const found = visit(root)
    if (found) return found
  }
  return undefined
}

function stateLabel(state?: string) {
  if (!state) return 'Not started'
  return state.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function IdentitySnapshot({
  summary,
  isLoading,
  orgslug,
}: {
  summary?: IdentitySummary
  isLoading: boolean
  orgslug: string
}) {
  const inner = findNode(summary, 'inner_world')
  const outer = findNode(summary, 'outer_world')
  const recentCount = summary?.recent_evidence?.length || 0
  const topInsights = summary?.top_insights || []
  const nextNode = summary?.suggested_next_nodes?.[0]

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { title: 'Inner World', node: inner },
          { title: 'Outer World', node: outer },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-950">{item.title}</div>
            <div className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
              {isLoading ? 'Loading' : stateLabel(item.node?.development_state)}
            </div>
            <div className="mt-3 flex gap-3 text-sm text-gray-600">
              <span>{item.node?.evidence_count || 0} evidence</span>
              <span>{item.node?.insight_count || 0} insights</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
        <div className="text-sm font-semibold text-gray-950">Emerging insights</div>
        {topInsights.length ? (
          <div className="mt-3 space-y-2">
            {topInsights.slice(0, 3).map((insight) => (
              <div key={insight.insight_uuid} className="text-sm text-gray-700">
                <span className="font-medium text-gray-950">{insight.label}</span>
                {insight.summary ? <span className="text-gray-500"> · {insight.summary}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            Your identity profile is ready for notes, outcomes, and insights.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-500">
            {recentCount ? `${recentCount} recent evidence item${recentCount === 1 ? '' : 's'}` : 'No evidence captured yet'}
          </p>
          <Link
            href={getUriWithOrg(orgslug, routePaths.org.journeyIdentity())}
            className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            {nextNode ? `Explore ${nextNode.title}` : 'Open identity'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function JourneyClient({ displayName, orgslug }: JourneyClientProps) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const primaryColor = org?.config?.config?.customization?.general?.color || org?.config?.config?.general?.color || ''
  const siteBackground = primaryColor ? hexToRgba(primaryColor, 0.05) : 'white'
  const surface = 'journey'
  const viewedKeysRef = useRef<Set<string>>(new Set())
  const suggestionsUrl = orgId && accessToken
    ? getSuggestedActionsUrl({ orgId, surface, slot: 'primary', limit: 3 })
    : null
  const { data: suggestedActions, isLoading } = useSWR(
    suggestionsUrl ? [suggestionsUrl, accessToken] : null,
    ([url, token]) => suggestedActionsFetcher(url, token),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  )
  const { data: identitySummary, isLoading: identityLoading } = useSWR(
    orgId && accessToken ? ['identity-summary', orgId, accessToken] : null,
    () => getIdentitySummary(orgId, accessToken),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  )
  const actionCards = (suggestedActions || []).map(suggestedActionToCard)

  useEffect(() => {
    if (!orgId || !accessToken || !suggestedActions?.length) return

    suggestedActions.forEach((action) => {
      if (viewedKeysRef.current.has(action.key)) return
      viewedKeysRef.current.add(action.key)
      recordSuggestedActionEvent({
        orgId,
        actionKey: action.key,
        eventType: 'viewed',
        surface,
        metadata: { source: action.source, kind: action.kind },
        accessToken,
      }).catch(() => {})
    })
  }, [accessToken, orgId, suggestedActions])

  const handleCardClick = (card: ActionCard) => {
    if (!orgId || !accessToken) return
    recordSuggestedActionEvent({
      orgId,
      actionKey: card.key,
      eventType: 'clicked',
      surface,
      metadata: card.metadata || {},
      accessToken,
    }).catch(() => {})
  }

  return (
    <main className="min-h-screen w-full">
      <section className="relative px-0 pt-0 md:px-6 md:pt-6 lg:px-8">
        <div className="mx-auto w-full max-w-(--breakpoint-2xl)">
          <div
            className="relative flex h-[calc(100svh-220px)] max-h-[560px] min-h-[500px] w-full overflow-hidden md:h-[calc(100svh-220px)] md:max-h-[620px] md:min-h-[500px] md:rounded-[28px]"
          >
            <img
              src="/jungle_landscape.jpg"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-white/10" />
            <div className="relative flex h-full w-full flex-col px-5 pb-0 pt-7 md:px-8 md:pb-8 md:pt-8 lg:px-10">
              <div className="max-w-[520px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
                  My Dashboard
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-white md:text-2xl">
                  Welcome back, {displayName}
                </h1>
              </div>

              <div className="mt-auto flex w-full justify-center">
                <div className="w-full max-w-[920px] pb-4 text-center md:pb-0">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                    What&apos;s next?
                  </p>
                  {isLoading ? (
                    <ActionCarouselSkeleton />
                  ) : actionCards.length > 0 ? (
                    <ActionCarousel cards={actionCards} orgslug={orgslug} onCardClick={handleCardClick} />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="relative z-10 -mt-8 rounded-t-[32px] px-5 pb-20 pt-12 md:mt-0 md:rounded-t-none md:px-6 md:pt-12 lg:px-8"
        style={{ backgroundColor: siteBackground }}
      >
        <div className="mx-auto grid w-full max-w-(--breakpoint-2xl) gap-8 lg:grid-cols-2">
          <section className="min-h-[260px]">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950">My Identity</h2>
            <IdentitySnapshot summary={identitySummary} isLoading={identityLoading} orgslug={orgslug} />
          </section>
          <section className="min-h-[260px]">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950">My Path</h2>
          </section>
        </div>
      </section>
    </main>
  )
}
