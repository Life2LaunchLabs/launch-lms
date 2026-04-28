'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Backpack,
  Check,
  ChevronDown,
  Circle,
  FileText,
  Play,
  StickyNote,
  Video,
  X,
} from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
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

  const getActivityTypeIcon = (activityType: string) => {
    switch (activityType) {
      case 'TYPE_VIDEO':
        return <Video size={12} />
      case 'TYPE_DOCUMENT':
        return <FileText size={12} />
      case 'TYPE_DYNAMIC':
        return <StickyNote size={12} />
      case 'TYPE_ASSIGNMENT':
        return <Backpack size={12} />
      default:
        return <FileText size={12} />
    }
  }

  const getStatusIcon = (activity: any, isHighlighted: boolean) => {
    const isComplete = courseRun?.steps?.find(
      (step: any) => step.activity_id === activity.id && step.complete === true
    )

    if (isComplete) {
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Check size={12} className="stroke-[2.5]" />
        </span>
      )
    }

    if (isHighlighted) {
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Play size={10} className="ml-[1px] fill-current stroke-[2.2]" />
        </span>
      )
    }

    return <Circle size={14} className="text-gray-300 fill-gray-100 stroke-[1.5]" />
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${isSheet ? '' : 'rounded-lg bg-white drop-shadow-xs'}`}>
      <div className={`flex items-center justify-between border-b border-gray-100 ${isSheet ? 'px-1 py-3' : 'px-5 py-4'}`}>
        {headerMode === 'back' ? (
          <Link
            href={getUriWithOrg(orgslug, courseHref || routePaths.org.course(cleanCourseUuid))}
            className="flex min-w-0 items-center gap-2 text-gray-900 transition-colors hover:text-gray-700"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600">
              <ArrowLeft size={15} />
            </span>
            <span className="truncate text-sm font-semibold">{course.name}</span>
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">Course outline</p>
              <p className="text-xs text-gray-500">{course.chapters?.length || 0} chapters</p>
            </div>
          </div>
        )}

        {variant === 'sidebar' && showCloseButton ? (
          <button
            onClick={onCloseSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      <div className={`flex-1 overflow-y-auto ${isSheet ? 'px-0 py-3' : 'px-3 py-3'}`}>
        <div className="space-y-3">
          {chapters.map((chapter: any, chapterIndex: number) => {
            const chapterKey = chapter.chapter_uuid || chapter.id?.toString() || chapter.name
            const isExpanded = expandedChapterIds[chapterKey] ?? false

            return (
              <div key={chapterKey} className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedChapterIds((prev) => ({
                      ...prev,
                      [chapterKey]: !isExpanded,
                    }))
                  }
                  className="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                >
                  <span
                    className={`mt-1 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <ChevronDown size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
                      {t('courses.chapter')} {chapterIndex + 1}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-900">{chapter.name}</p>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="divide-y divide-gray-100">
                    {chapter.activities.map((activity: any, activityIndex: number) => {
                      const cleanActivityUuid = normalizeActivityId(activity.activity_uuid)
                      if (!cleanActivityUuid) return null
                      const isCurrent = cleanActivityUuid === normalizedCurrentActivityId
                      const isHighlighted = cleanActivityUuid === normalizedHighlightedActivityId
                      const isNextUp = highlightMode === 'next' && isHighlighted && !isCurrent
                      const label = isCurrent
                        ? t('activities.current')
                        : isNextUp
                          ? t('courses.get_started')
                          : null

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
                          className={`block px-4 py-3 transition-colors ${
                            isHighlighted ? 'bg-emerald-50/80' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0">
                              {getStatusIcon(activity, isHighlighted)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${isHighlighted ? 'text-emerald-700' : 'text-gray-500'}`}>
                                  Lesson {activityIndex + 1}
                                </span>
                                <span className={`flex items-center gap-1 text-[11px] ${isHighlighted ? 'text-emerald-600' : 'text-gray-400'}`}>
                                  {getActivityTypeIcon(activity.activity_type)}
                                </span>
                                {label ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    {label}
                                  </span>
                                ) : null}
                              </div>
                              <p className={`mt-1 truncate text-sm font-medium ${isHighlighted ? 'text-emerald-950' : 'text-gray-900'}`}>
                                {activity.name}
                              </p>
                            </div>
                            <ArrowRight size={14} className={isHighlighted ? 'mt-1 text-emerald-500' : 'mt-1 text-gray-300'} />
                          </div>
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
