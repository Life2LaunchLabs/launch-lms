'use client'

import React from 'react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import TrailCourseCard from '@components/Pages/Trail/TrailCourseCard'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'

interface InProgressSectionProps {
  orgslug: string
}

const CARD_WIDTH = 280
const CARD_GAP = 16
const CARD_PEEK = 52
const SCROLL_DURATION_MS = 240

function easeOutQuint(progress: number) {
  return 1 - Math.pow(1 - progress, 5)
}

function InProgressSection({ orgslug }: InProgressSectionProps) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const orgID = org?.id
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const cardRefs = React.useRef<Array<HTMLDivElement | null>>([])
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)
  const animationFrameRef = React.useRef<number | null>(null)

  const isCoursesEnabled =
    org?.config?.config?.resolved_features?.courses?.enabled ??
    org?.config?.config?.features?.courses?.enabled !== false

  const { data: trail } = useSWR(
    isCoursesEnabled && orgID && access_token
      ? `${getAPIUrl()}trail/org/${orgID}/trail`
      : null,
    (url) => swrFetcher(url, access_token)
  )

  const updateScrollState = React.useCallback(() => {
    const container = scrollerRef.current
    if (!container) return

    const maxScrollLeft = container.scrollWidth - container.clientWidth
    setCanScrollLeft(container.scrollLeft > 4)
    setCanScrollRight(container.scrollLeft < maxScrollLeft - 4)
  }, [])

  const animateScrollTo = React.useCallback((targetScrollLeft: number) => {
    const container = scrollerRef.current
    if (!container) return

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    const startScrollLeft = container.scrollLeft
    const maxScrollLeft = Math.max(
      0,
      container.scrollWidth - container.clientWidth
    )
    const clampedTarget = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft))
    const startTime = performance.now()

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / SCROLL_DURATION_MS, 1)
      const eased = easeOutQuint(progress)
      container.scrollLeft =
        startScrollLeft + (clampedTarget - startScrollLeft) * eased

      updateScrollState()

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step)
      } else {
        animationFrameRef.current = null
      }
    }

    animationFrameRef.current = requestAnimationFrame(step)
  }, [updateScrollState])

  const scrollRight = React.useCallback(() => {
    const container = scrollerRef.current
    if (!container) return

    const maxScrollLeft = Math.max(
      0,
      container.scrollWidth - container.clientWidth
    )
    const viewportRight = container.scrollLeft + container.clientWidth
    const firstClippedIndex = cardRefs.current.findIndex((card) => {
      if (!card) return false
      const cardRight = card.offsetLeft + card.offsetWidth
      return cardRight > viewportRight + 2
    })

    if (firstClippedIndex === -1) return

    const targetCard = cardRefs.current[firstClippedIndex]
    if (!targetCard) return

    const targetScrollLeft = targetCard.offsetLeft - CARD_PEEK
    animateScrollTo(
      maxScrollLeft - targetScrollLeft <= CARD_PEEK
        ? maxScrollLeft
        : targetScrollLeft
    )
  }, [animateScrollTo])

  const scrollLeft = React.useCallback(() => {
    const container = scrollerRef.current
    if (!container) return

    const viewportLeft = container.scrollLeft
    let lastClippedIndex = -1

    cardRefs.current.forEach((card, index) => {
      if (!card) return
      const cardLeft = card.offsetLeft
      if (cardLeft < viewportLeft - 2) {
        lastClippedIndex = index
      }
    })

    if (lastClippedIndex === -1) return

    const targetCard = cardRefs.current[lastClippedIndex]
    if (!targetCard) return

    const targetScrollLeft =
      targetCard.offsetLeft - CARD_WIDTH - CARD_GAP + CARD_PEEK

    animateScrollTo(targetScrollLeft <= CARD_PEEK ? 0 : targetScrollLeft)
  }, [animateScrollTo])

  React.useEffect(() => {
    updateScrollState()

    const container = scrollerRef.current
    if (!container) return

    const handleScroll = () => updateScrollState()
    container.addEventListener('scroll', handleScroll, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      updateScrollState()
    })
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [updateScrollState, trail?.runs?.length])

  React.useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Don't render for unauthenticated users
  if (!access_token) return null

  return (
    <div className="flex flex-col space-y-2 mb-6">
      <h2 className="my-2 text-lg font-bold tracking-tight text-gray-900">
        In Progress
      </h2>

      {!trail ? (
        <PageLoading />
      ) : trail.runs.length === 0 ? (
        <div className="col-span-full flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
          <div className="p-4 bg-white rounded-full nice-shadow mb-4">
            <BookOpen className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold text-gray-600 mb-2">
            {t('user.no_courses_in_progress')}
          </h1>
          <p className="text-md text-gray-400 mb-6 text-center max-w-xs">
            {t('user.start_course_to_see_progress')}
          </p>
        </div>
      ) : (
        <div className="relative">
          {canScrollLeft ? (
            <button
              type="button"
              onClick={scrollLeft}
              aria-label="Scroll left"
              className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-lg ring-1 ring-black/8 transition-colors hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}

          {canScrollRight ? (
            <button
              type="button"
              onClick={scrollRight}
              aria-label="Scroll right"
              className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-lg ring-1 ring-black/8 transition-colors hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : null}

          <div
            ref={scrollerRef}
            className="overflow-x-hidden overflow-y-visible"
          >
            <div className="flex gap-4 py-2 snap-x snap-mandatory">
              {trail.runs.map((run: any, index: number) => (
                <div
                  key={run.course.course_uuid}
                  ref={(node) => {
                    cardRefs.current[index] = node
                  }}
                  className="w-[280px] shrink-0 snap-start"
                >
                  <TrailCourseCard
                    run={run}
                    course={run.course}
                    orgslug={orgslug}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InProgressSection
