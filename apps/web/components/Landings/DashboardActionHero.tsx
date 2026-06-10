'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { swrFetcher } from '@services/utils/ts/requests'

type ActionCard = {
  id: string
  url: string
  title: string
  subtext: string
  progress?: number
  nextActivityName?: string
  ctaLabel?: string
  imageUrl?: string
}

type DashboardActionHeroProps = {
  displayName: string
  orgslug: string
}

function cleanCourseUuid(courseUuid?: string | null) {
  return String(courseUuid || '').replace('course_', '')
}

function cleanActivityUuid(activityUuid?: string | null) {
  return String(activityUuid || '').replace('activity_', '')
}

function getCourseThumbnailUrl(course: any) {
  const orgUuid = course?.owner_org_uuid || course?.org_uuid
  if (!orgUuid || !course?.course_uuid || !course?.thumbnail_image) return null
  return getCourseThumbnailMediaDirectory(orgUuid, course.course_uuid, course.thumbnail_image)
}

function getFirstIncompleteCoreCourse(coreCourses: any[]) {
  return coreCourses.find((item: any) => {
    const totalActivities = Number(item?.total_activities || 0)
    const completedActivities = Number(item?.completed_activities || 0)
    return totalActivities > 0 && completedActivities < totalActivities
  }) || null
}

function getNextCoreActivity(item: any) {
  for (const chapter of item?.chapters || []) {
    if (chapter?.next_activity?.activity_uuid) return chapter.next_activity
  }
  return null
}

function getCoreCourseActionCard(item: any): ActionCard {
  const course = item?.course || {}
  const cleanCourse = cleanCourseUuid(course?.course_uuid)
  const nextActivity = getNextCoreActivity(item)
  const cleanActivity = cleanActivityUuid(nextActivity?.activity_uuid)
  const url = cleanCourse && cleanActivity
    ? routePaths.org.courseActivity(cleanCourse, cleanActivity)
    : cleanCourse
      ? routePaths.org.course(cleanCourse)
      : routePaths.org.badges()
  const courseName = course?.name || 'your next CORE course'

  return {
    id: `continue-core-${cleanCourse || 'course'}`,
    url,
    title: `Continue ${courseName}`,
    subtext: '',
    progress: Number(item?.progress || 0),
    nextActivityName: nextActivity?.name,
    ctaLabel: 'Continue',
    imageUrl: getCourseThumbnailUrl(course) || '/welcome_cards.png',
  }
}

const fallbackCoreCard: ActionCard = {
  id: 'explore-core-courses',
  url: routePaths.org.badges(),
  title: 'Explore CORE badges',
  subtext: 'Start with the CORE badges below and build your foundation.',
  ctaLabel: 'Explore',
  imageUrl: '/welcome_cards.png',
}

const staticActionCards: ActionCard[] = [
  {
    id: 'develop-profile',
    url: routePaths.org.profileEdit(),
    title: 'Develop your profile',
    subtext: 'Add your story, strengths, and goals so your progress has a place to land.',
    ctaLabel: 'Build profile',
    imageUrl: '/empty_avatar.png',
  },
  {
    id: 'explore-resources',
    url: routePaths.org.resources(),
    title: 'Explore resources',
    subtext: 'Find guides, tools, and references that can help with what you are working on now.',
    ctaLabel: 'Browse',
  },
]

function ActionDisplayCard({
  card,
  elevation,
  orgslug,
}: {
  card: ActionCard
  elevation: number
  orgslug: string
}) {
  const href = getUriWithOrg(orgslug, card.url)
  const bgClass = (['bg-white', 'bg-gray-100', 'bg-gray-200'] as const)[
    Math.min(elevation, 2)
  ]
  const shadowClass = (['shadow-xl', 'shadow-lg', 'shadow-md'] as const)[
    Math.min(elevation, 2)
  ]

  return (
    <div
      className={`flex h-[270px] w-[min(82vw,360px)] flex-col overflow-hidden rounded-[28px] p-6 text-left transition-colors duration-300 sm:h-[285px] sm:w-[380px] ${bgClass} ${shadowClass}`}
    >
      <h3 className="text-2xl font-black leading-tight text-gray-950">
        {card.title}
      </h3>
      <div className="mt-3 flex flex-1 items-stretch gap-4">
        <div className="flex flex-1 flex-col">
          {typeof card.progress === 'number' ? (
            <div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gray-950 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }}
                />
              </div>
              {card.nextActivityName ? (
                <p className="mt-3 text-base font-semibold leading-6 text-gray-600">
                  Next up: {card.nextActivityName}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-base leading-6 text-gray-500">{card.subtext}</p>
          )}
          <div className="mt-auto">
            <Link
              href={href}
              className="inline-flex items-center rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              {card.ctaLabel || 'Let&apos;s go!'}
            </Link>
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

export function LayeredCardCarousel<T extends { id: string }>({
  cards,
  renderCard,
  ariaLabel = 'featured card',
  className = '',
  stageClassName = 'h-[290px] sm:h-[305px]',
  previousButtonClassName = '-translate-x-[250px]',
  nextButtonClassName = 'translate-x-[250px]',
}: {
  cards: T[]
  // eslint-disable-next-line no-unused-vars
  renderCard: (card: T, elevation: number) => React.ReactNode
  ariaLabel?: string
  className?: string
  stageClassName?: string
  previousButtonClassName?: string
  nextButtonClassName?: string
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(
    null
  )
  const gesture = useRef({ startX: 0, dragX: 0, active: false, activeIndex: 0 })

  const moveTo = (index: number) => {
    if (!cards.length) return
    const next = Math.max(0, Math.min(index, cards.length - 1))
    gesture.current.activeIndex = next
    setActiveIndex(next)
  }

  const navigateTo = (direction: 'prev' | 'next') => {
    const target =
      direction === 'next'
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
      dx *= 0.25
    }
    gesture.current.dragX = dx
    setDragX(dx)
  }

  const onDragEnd = () => {
    if (!gesture.current.active) return
    gesture.current.active = false
    setIsDragging(false)
    const dx = gesture.current.dragX
    if (dx < -72) {
      moveTo(gesture.current.activeIndex + 1)
    } else if (dx > 72) {
      moveTo(gesture.current.activeIndex - 1)
    }
    gesture.current.dragX = 0
    setDragX(0)
  }

  return (
    <div className={`relative flex flex-col items-center overflow-visible py-2 ${className}`}>
      <div
        className={`relative flex w-full items-center justify-center ${stageClassName}`}
        style={{ touchAction: 'pan-y' }}
        onTouchStart={(event) => onDragStart(event.touches[0].clientX)}
        onTouchMove={(event) => onDragMove(event.touches[0].clientX)}
        onTouchEnd={onDragEnd}
      >
        {cards.map((card, index) => {
          const offset = index - activeIndex
          if (Math.abs(offset) > 2) return null
          const active = offset === 0
          const activeDragging = active && isDragging
          const activeExiting = active && exitDirection !== null
          const activeTransform = (() => {
            if (activeExiting) {
              return `translateX(${exitDirection === 'left' ? -280 : 280}px) rotate(${exitDirection === 'left' ? -5 : 5}deg) scale(1)`
            }
            if (activeDragging) {
              return `translateX(${dragX}px) rotate(${dragX * 0.03}deg) scale(1)`
            }
            return 'translateX(0px) rotate(0deg) scale(1)'
          })()

          return (
            <div
              key={card.id}
              className="absolute"
              style={{
                transform: active
                  ? activeTransform
                  : `translateX(${offset * 25}px) translateY(${Math.abs(offset) * 10}px) scale(${1 - Math.abs(offset) * 0.04})`,
                zIndex: 10 - Math.abs(offset),
                transition: activeDragging
                  ? 'none'
                  : active && activeExiting
                    ? 'transform 220ms ease-in'
                    : 'transform 300ms ease',
              }}
            >
              {renderCard(card, Math.abs(offset))}
            </div>
          )
        })}
        {activeIndex > 0 ? (
          <button
            type="button"
            aria-label={`Previous ${ariaLabel}`}
            onClick={() => navigateTo('prev')}
            className={`absolute left-1/2 z-30 hidden h-11 w-11 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md hover:bg-white sm:flex ${previousButtonClassName}`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        {activeIndex < cards.length - 1 ? (
          <button
            type="button"
            aria-label={`Next ${ariaLabel}`}
            onClick={() => navigateTo('next')}
            className={`absolute right-1/2 z-30 hidden h-11 w-11 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md hover:bg-white sm:flex ${nextButtonClassName}`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-center">
        <div className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-2 backdrop-blur-sm">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              aria-label={`Show ${ariaLabel} ${index + 1}`}
              onClick={() => moveTo(index)}
              className={`h-2 rounded-full bg-white transition-all duration-300 ${
                index === activeIndex ? 'w-5' : 'w-2 opacity-50'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionCarousel({
  cards,
  orgslug,
}: {
  cards: ActionCard[]
  orgslug: string
}) {
  return (
    <LayeredCardCarousel
      cards={cards}
      ariaLabel="featured card"
      renderCard={(card, elevation) => (
        <ActionDisplayCard card={card} elevation={elevation} orgslug={orgslug} />
      )}
    />
  )
}

export default function DashboardActionHero({
  displayName,
  orgslug,
}: DashboardActionHeroProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const { data: coreProgressData } = useSWR(
    accessToken && orgslug
      ? `${getAPIUrl()}courses/core/progress?org_slug=${encodeURIComponent(orgslug)}`
      : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const actionCards = useMemo(() => {
    const coreCourses = Array.isArray(coreProgressData) ? coreProgressData : []
    const nextCoreCourse = getFirstIncompleteCoreCourse(coreCourses)
    return [
      nextCoreCourse ? getCoreCourseActionCard(nextCoreCourse) : fallbackCoreCard,
      ...staticActionCards,
    ]
  }, [coreProgressData])

  return (
    <section className="relative w-full px-0 pt-0 md:px-6 md:pt-6 lg:px-8">
      <div className="mx-auto w-full max-w-(--breakpoint-2xl)">
        <div className="relative flex h-[calc(100svh-220px)] max-h-[560px] min-h-[500px] w-full overflow-hidden md:h-[calc(100svh-220px)] md:max-h-[620px] md:min-h-[500px] md:rounded-[28px]">
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
                <ActionCarousel cards={actionCards} orgslug={orgslug} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
