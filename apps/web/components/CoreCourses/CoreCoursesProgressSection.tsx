'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { BookOpen, CheckCircle2, Circle, Gauge } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'

type CoreCourseProgressSectionProps = {
  orgslug: string
  variant?: 'dashboard' | 'profile'
  className?: string
  courseUuid?: string
}

function cleanCourseUuid(courseUuid?: string) {
  return String(courseUuid || '').replace('course_', '')
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-gray-900 transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export default function CoreCoursesProgressSection({
  orgslug,
  variant = 'dashboard',
  className = '',
  courseUuid,
}: CoreCourseProgressSectionProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token

  const { data, isLoading } = useSWR(
    accessToken && orgslug
      ? `${getAPIUrl()}courses/core/progress?org_slug=${encodeURIComponent(orgslug)}`
      : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const coreCourses = Array.isArray(data)
    ? data.filter((item: any) => !courseUuid || item?.course?.course_uuid === courseUuid)
    : []

  if (!accessToken || (!isLoading && coreCourses.length === 0)) return null

  const isProfile = variant === 'profile'

  return (
    <section className={`${isProfile ? 'px-4 py-6 sm:px-0' : 'flex flex-col space-y-2 mb-6'} ${className}`}>
      <div className={isProfile ? 'mb-4 flex items-center justify-between gap-3' : 'flex items-center gap-2'}>
        <div>
          <h2 className={isProfile ? 'text-2xl font-semibold text-gray-950' : 'my-2 text-lg font-bold tracking-tight text-gray-900'}>
            CORE Courses
          </h2>
          {isProfile ? (
            <p className="mt-1 text-sm text-gray-500">Progress across highlighted courses</p>
          ) : null}
        </div>
      </div>

      <div className={isProfile ? 'grid gap-4' : 'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {isLoading ? (
          (courseUuid ? [1] : [1, 2]).map((item) => (
            <div key={item} className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
              <div className="mb-4 h-4 w-1/2 animate-pulse rounded-full bg-gray-100" />
              <div className="mb-5 h-2 w-full animate-pulse rounded-full bg-gray-100" />
              <div className="grid gap-2">
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-gray-100" />
                <div className="h-3 w-2/3 animate-pulse rounded-full bg-gray-100" />
              </div>
            </div>
          ))
        ) : coreCourses.map((item: any) => {
          const course = item.course || {}
          const courseHref = getUriWithOrg(orgslug, `/course/${cleanCourseUuid(course.course_uuid)}`)

          return (
            <div key={course.course_uuid} className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                    <Gauge className="h-3 w-3" />
                    CORE
                  </div>
                  <Link href={courseHref} className="block truncate text-base font-semibold text-gray-900 hover:text-gray-700">
                    {course.name}
                  </Link>
                  <p className="mt-1 text-xs text-gray-400">
                    {item.completed_activities} of {item.total_activities} activities complete
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-2xl font-bold text-gray-900">{item.progress}%</div>
                  <div className="text-[10px] font-medium text-gray-400">overall</div>
                </div>
              </div>

              <ProgressBar value={item.progress || 0} />

              <div className="mt-4 grid gap-2">
                {(item.chapters || []).slice(0, isProfile ? 4 : 5).map((chapter: any) => (
                  <div key={chapter.chapter_uuid || chapter.id} className="flex items-center gap-3">
                    {chapter.complete ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-gray-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-medium text-gray-700">{chapter.name}</span>
                        <span className="shrink-0 text-[10px] text-gray-400">{chapter.progress}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-gray-400" style={{ width: `${chapter.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                {(item.chapters || []).length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-400">
                    <BookOpen className="h-4 w-4" />
                    No chapters yet
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
