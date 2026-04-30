'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Backpack,
  ChevronDown,
  FileText,
  ListChecks,
  StickyNote,
  Video,
} from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import React, { useEffect, useMemo, useRef, useState } from 'react'

interface ActivityCourseOutlineProps {
  course: any
  currentActivityId?: string | null
  highlightedActivityId?: string | null
  orgslug: string
  trailData?: any
  courseHref?: string
  // eslint-disable-next-line no-unused-vars
  getActivityHref?: (...args: [string]) => string
  variant?: 'sidebar' | 'sheet'
  onNavigate?: () => void
  onCloseSidebar?: () => void
  showCloseButton?: boolean
  autoScrollToHighlighted?: boolean
  headerMode?: 'back' | 'summary'
  highlightMode?: 'current' | 'next'
  initialExpandedActivityId?: string | null
}

function normalizeActivityId(activityId?: string | null) {
  if (!activityId) return null
  return activityId.replace('activity_', '')
}

const ACTIVITY_TYPE_ICONS: Record<string, React.ElementType> = {
  TYPE_VIDEO: Video,
  TYPE_DOCUMENT: FileText,
  TYPE_DYNAMIC: StickyNote,
  TYPE_ASSIGNMENT: Backpack,
  TYPE_QUIZ: ListChecks,
}

export default function ActivityCourseOutline({
  course,
  currentActivityId,
  highlightedActivityId,
  orgslug,
  trailData,
  courseHref,
  getActivityHref,
  variant = 'sidebar',
  onNavigate,
  onCloseSidebar,
  showCloseButton = true,
  autoScrollToHighlighted = false,
  headerMode = 'back',
  highlightMode = 'current',
  initialExpandedActivityId,
}: ActivityCourseOutlineProps): React.ReactNode {
  const cleanCourseUuid = course.course_uuid?.replace('course_', '')
  const isSheet = variant === 'sheet'
  const normalizedCurrentActivityId = normalizeActivityId(currentActivityId)
  const normalizedHighlightedActivityId =
    normalizeActivityId(highlightedActivityId) ?? normalizedCurrentActivityId
  const normalizedInitialExpandedActivityId =
    normalizeActivityId(initialExpandedActivityId) ?? normalizedHighlightedActivityId
  const scrollTargetRef = useRef<HTMLAnchorElement | null>(null)

  const courseRun = useMemo(() => {
    return trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '')
      return cleanRunCourseUuid === cleanCourseUuid
    })
  }, [cleanCourseUuid, trailData])

  const chapters = course?.chapters || []

  const allActivities = useMemo(() => {
    return chapters.flatMap((chapter: any) => chapter.activities || [])
  }, [chapters])

  const { completedCount, totalCount } = useMemo(() => {
    const completed = allActivities.filter((a: any) =>
      courseRun?.steps?.find((step: any) => step.activity_id === a.id && step.complete === true)
    ).length
    return { completedCount: completed, totalCount: allActivities.length }
  }, [allActivities, courseRun])

  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const initialExpandedChapterUuid = (() => {
    if (!chapters.length) return null
    for (const chapter of chapters) {
      const hasInitialActivity = chapter.activities?.some((activity: any) => {
        return normalizeActivityId(activity.activity_uuid) === normalizedInitialExpandedActivityId
      })
      if (hasInitialActivity) {
        return chapter.chapter_uuid || chapter.id?.toString() || chapter.name
      }
    }
    const firstChapter = chapters[0]
    return firstChapter?.chapter_uuid || firstChapter?.id?.toString() || firstChapter?.name || null
  })()

  const [expandedChapterIds, setExpandedChapterIds] = useState<Record<string, boolean>>(() =>
    initialExpandedChapterUuid ? { [initialExpandedChapterUuid]: true } : {}
  )

  useEffect(() => {
    if (!autoScrollToHighlighted) return
    if (!scrollTargetRef.current) return
    scrollTargetRef.current.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    })
  }, [autoScrollToHighlighted, variant, normalizedHighlightedActivityId])

  const isActivityComplete = (activity: any) =>
    !!courseRun?.steps?.find(
      (step: any) => step.activity_id === activity.id && step.complete === true
    )

  const getActivityStatusIcon = (activity: any, isHighlighted: boolean) => {
    const complete = isActivityComplete(activity)
    const Icon = ACTIVITY_TYPE_ICONS[activity.activity_type] ?? FileText

    let containerClass: string
    if (complete) {
      containerClass = 'bg-emerald-700 text-white'
    } else if (isHighlighted) {
      containerClass = 'bg-emerald-500 text-white ring-2 ring-white'
    } else {
      containerClass = 'bg-gray-200 text-gray-400'
    }

    return (
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${containerClass}`}>
        <Icon size={12} />
      </span>
    )
  }

  const getChapterProgress = (chapter: any) => {
    const activities = chapter.activities || []
    if (!activities.length) return 0
    const completed = activities.filter((a: any) => isActivityComplete(a)).length
    return completed / activities.length
  }

  const SVG_SIZE = 28
  const RING_RADIUS = 11
  const RING_STROKE = 2
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

  return (
    <div className={`flex min-h-0 flex-col ${isSheet ? 'h-full' : 'max-h-[600px] overflow-hidden rounded-lg bg-white drop-shadow-xs'}`}>
      <div>
        {headerMode === 'back' ? (
          <div className={`${isSheet ? 'px-3 pb-2 pt-3' : 'px-3 pb-2 pt-3'}`}>
            <Link
              href={getUriWithOrg(orgslug, courseHref || routePaths.org.course(cleanCourseUuid))}
              className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-gray-900 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft size={15} className="shrink-0 text-gray-500" />
              <span className="truncate text-sm font-semibold">{course.name}</span>
            </Link>
          </div>
        ) : (
          <div className={`flex items-center gap-2 ${isSheet ? 'px-4 pb-2 pt-4' : 'px-5 pb-2 pt-4'}`}>
            <p className="text-sm font-semibold text-gray-900">Course outline</p>
            <p className="text-xs text-gray-500">{course.chapters?.length || 0} chapters</p>
          </div>
        )}
        <div className="h-1 bg-gray-200/80">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-green-500 to-lime-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className={`flex justify-end pt-1 pb-2 ${isSheet ? 'px-4' : 'px-5'}`}>
          <span className="text-xs font-semibold tabular-nums text-gray-400">
            {completedCount} / {totalCount}
          </span>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto ${isSheet ? 'px-0 py-3' : 'px-3 py-3'}`}>
        <div className="space-y-3">
          {chapters.map((chapter: any, chapterIndex: number) => {
            const chapterKey = chapter.chapter_uuid || chapter.id?.toString() || chapter.name
            const isExpanded = expandedChapterIds[chapterKey] ?? false
            const progress = getChapterProgress(chapter)
            const dashOffset = RING_CIRCUMFERENCE * (1 - progress)

            return (
              <div key={chapterKey} className="overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedChapterIds((prev) => ({
                      ...prev,
                      [chapterKey]: !isExpanded,
                    }))
                  }
                  className={`flex w-full items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-gray-100 ${isExpanded ? 'bg-gray-100' : ''}`}
                >
                  {/* Chapter number with progress ring */}
                  <div className="relative shrink-0" style={{ width: SVG_SIZE, height: SVG_SIZE }}>
                    <svg
                      width={SVG_SIZE}
                      height={SVG_SIZE}
                      className="-rotate-90"
                      style={{ display: 'block' }}
                    >
                      <circle
                        cx={SVG_SIZE / 2}
                        cy={SVG_SIZE / 2}
                        r={RING_RADIUS}
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth={RING_STROKE}
                      />
                      {progress > 0 && (
                        <circle
                          cx={SVG_SIZE / 2}
                          cy={SVG_SIZE / 2}
                          r={RING_RADIUS}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth={RING_STROKE}
                          strokeDasharray={RING_CIRCUMFERENCE}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold leading-none text-gray-600">
                        {chapterIndex + 1}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{chapter.name}</p>
                  </div>

                  <span
                    className={`shrink-0 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <ChevronDown size={16} />
                  </span>
                </button>

                {isExpanded ? (
                  <div>
                    {chapter.activities.map((activity: any) => {
                      const cleanActivityUuid = normalizeActivityId(activity.activity_uuid)
                      if (!cleanActivityUuid) return null
                      const isHighlighted = cleanActivityUuid === normalizedHighlightedActivityId

                      return (
                        <Link
                          key={activity.id}
                          href={getUriWithOrg(
                            orgslug,
                            getActivityHref
                              ? getActivityHref(cleanActivityUuid)
                              : routePaths.org.courseActivity(cleanCourseUuid, cleanActivityUuid)
                          )}
                          prefetch={false}
                          onClick={onNavigate}
                          ref={isHighlighted ? scrollTargetRef : null}
                          className={`flex items-center gap-3 pl-8 pr-4 py-3 transition-colors ${
                            isHighlighted ? 'bg-emerald-50/80' : 'hover:bg-gray-50'
                          }`}
                        >
                          {getActivityStatusIcon(activity, isHighlighted)}
                          <p className={`min-w-0 flex-1 truncate text-sm font-medium ${isHighlighted ? 'text-emerald-950' : 'text-gray-900'}`}>
                            {activity.name}
                          </p>
                        </Link>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
