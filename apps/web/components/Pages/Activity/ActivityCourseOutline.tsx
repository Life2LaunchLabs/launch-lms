'use client'

import Link from 'next/link'
import { ArrowLeft, Check, ChevronRight, Circle, FileText, Play, StickyNote, Video, Backpack, X } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface ActivityCourseOutlineProps {
  course: any
  currentActivityId: string
  orgslug: string
  trailData?: any
  variant?: 'sidebar' | 'sheet'
  onNavigate?: () => void
  onCloseSidebar?: () => void
}

export default function ActivityCourseOutline({
  course,
  currentActivityId,
  orgslug,
  trailData,
  variant = 'sidebar',
  onNavigate,
  onCloseSidebar,
}: ActivityCourseOutlineProps): React.ReactNode {
  const { t } = useTranslation()
  const cleanCourseUuid = course.course_uuid?.replace('course_', '')
  const isSheet = variant === 'sheet'

  const courseRun = useMemo(() => {
    return trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '')
      return cleanRunCourseUuid === cleanCourseUuid
    })
  }, [cleanCourseUuid, trailData])

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

  const getStatusIcon = (activity: any, isCurrent: boolean) => {
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

    if (isCurrent) {
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Play size={10} className="ml-[1px] fill-current stroke-[2.2]" />
        </span>
      )
    }

    return <Circle size={14} className="text-gray-300 fill-gray-100 stroke-[1.5]" />
  }

  return (
    <div className={`flex h-full flex-col ${isSheet ? '' : 'rounded-lg bg-white drop-shadow-xs'}`}>
      <div className={`flex items-center justify-between border-b border-gray-100 ${isSheet ? 'px-1 py-3' : 'px-5 py-4'}`}>
        {variant === 'sidebar' ? (
          <Link
            href={getUriWithOrg(orgslug, routePaths.org.course(cleanCourseUuid))}
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

        {variant === 'sidebar' ? (
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
          {course.chapters.map((chapter: any, chapterIndex: number) => (
            <div key={chapter.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
                  {t('courses.chapter')} {chapterIndex + 1}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{chapter.name}</p>
              </div>

              <div className="divide-y divide-gray-100">
                {chapter.activities.map((activity: any, activityIndex: number) => {
                  const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '')
                  const isCurrent = cleanActivityUuid === currentActivityId.replace('activity_', '')

                  return (
                    <Link
                      key={activity.id}
                      href={getUriWithOrg(orgslug, routePaths.org.courseActivity(cleanCourseUuid, cleanActivityUuid))}
                      prefetch={false}
                      onClick={onNavigate}
                      className={`block px-4 py-3 transition-colors ${
                        isCurrent ? 'bg-emerald-50/80' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {getStatusIcon(activity, isCurrent)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold ${isCurrent ? 'text-emerald-700' : 'text-gray-500'}`}>
                              Lesson {activityIndex + 1}
                            </span>
                            <span className={`flex items-center gap-1 text-[11px] ${isCurrent ? 'text-emerald-600' : 'text-gray-400'}`}>
                              {getActivityTypeIcon(activity.activity_type)}
                            </span>
                          </div>
                          <p className={`mt-1 truncate text-sm font-medium ${isCurrent ? 'text-emerald-950' : 'text-gray-900'}`}>
                            {activity.name}
                          </p>
                        </div>
                        <ChevronRight size={14} className={isCurrent ? 'mt-1 text-emerald-500' : 'mt-1 text-gray-300'} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
