'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ListTree } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { findCourseRun, isCourseActivityCompleted } from '@services/courses/progress'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from 'usehooks-ts'

interface ActivityHeaderProps {
  course: any
  courseuuid: string
  orgslug: string
  trailData?: any
  onOpenOutline?: () => void
  onToggleDesktopSidebar?: () => void
  disableOutlineAccess?: boolean
}

export default function ActivityHeader({
  course,
  courseuuid,
  orgslug,
  trailData,
  onOpenOutline,
  onToggleDesktopSidebar,
  disableOutlineAccess = false,
}: ActivityHeaderProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const isCompact = useMediaQuery('(max-width: 1023px)')
  const [isSticky, setIsSticky] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { threshold: 0 }
    )

    if (sentinelRef.current) observer.observe(sentinelRef.current)

    return () => observer.disconnect()
  }, [])

  const allActivities = useMemo(() => {
    let flattened: any[] = []

    course.chapters.forEach((chapter: any, chapterIndex: number) => {
      chapter.activities.forEach((act: any) => {
        flattened.push({
          ...act,
          cleanUuid: act.activity_uuid?.replace('activity_', ''),
          chapterIndex,
          chapterName: chapter.name,
        })
      })
    })

    return flattened
  }, [course])

  const cleanCourseUuid = courseuuid.replace('course_', '')
  const courseRun = useMemo(() => findCourseRun(trailData, course), [trailData, course])

  const { completedCount, totalCount } = useMemo(() => {
    const completed = allActivities.filter((act: any) => isCourseActivityCompleted(courseRun, act.id)).length
    return { completedCount: completed, totalCount: allActivities.length }
  }, [allActivities, courseRun])

  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const lessonWord = totalCount === 1 ? 'lesson' : 'lessons'

  const progressSection = (
    <div className="min-w-0">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-200/90 sm:h-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-green-500 to-lime-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-500 sm:text-sm">
          {completedCount} / {totalCount} {lessonWord}
        </span>
      </div>
    </div>
  )

  const headerRow = isCompact ? (
    <div className="space-y-3 py-2 sm:py-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 nice-shadow transition-colors hover:bg-gray-50"
          aria-label="Go back"
        >
          <ChevronLeft size={18} />
        </button>

        {disableOutlineAccess ? (
          <div className="min-w-0 px-1 text-center">
            <span className="block truncate text-sm font-semibold text-gray-900">{course.name}</span>
          </div>
        ) : (
          <button
            onClick={onOpenOutline}
            className="flex min-w-0 items-center justify-center gap-2 rounded-full border border-gray-200/80 bg-white px-4 py-3 text-gray-900 nice-shadow transition-colors hover:bg-gray-50"
          >
            <span className="truncate text-sm font-semibold">{course.name}</span>
            <ChevronDown size={16} className="shrink-0 text-gray-500" />
          </button>
        )}
      </div>

      {progressSection}
    </div>
  ) : (
    <div className="rounded-lg bg-white px-5 py-5 drop-shadow-xs">
      <div className={`grid items-center gap-5 ${disableOutlineAccess ? 'grid-cols-[minmax(180px,280px)_minmax(0,1fr)]' : 'grid-cols-[auto_minmax(180px,280px)_minmax(0,1fr)]'}`}>
        {!disableOutlineAccess ? (
          <button
            onClick={onToggleDesktopSidebar}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-gray-700 ring-1 ring-gray-200/80 transition-colors hover:bg-gray-100"
            aria-label={t('courses.chapters')}
          >
            <ListTree size={18} />
          </button>
        ) : null}

        <div className="min-w-0">
          {disableOutlineAccess ? (
            <span className="block truncate text-sm font-semibold text-gray-900">
              {course.name}
            </span>
          ) : (
            <Link
              href={getUriWithOrg(orgslug, routePaths.org.course(cleanCourseUuid))}
              className="truncate text-sm font-semibold text-gray-900 transition-colors hover:text-gray-700"
            >
              {course.name}
            </Link>
          )}
        </div>

        {progressSection}
      </div>
    </div>
  )

  return (
    <>
      <div ref={sentinelRef} className={isSticky ? 'invisible' : ''}>
        {headerRow}
      </div>

      {isSticky ? (
        <div className="fixed left-0 right-0 top-0 bg-[#f5f5f5]" style={{ zIndex: 'var(--z-drag-overlay)' }}>
          <div className="mx-auto max-w-(--breakpoint-2xl) px-4 sm:px-6 lg:px-8">
            <div className={isCompact ? 'pt-2 sm:pt-3' : 'pt-4'}>
              {headerRow}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
