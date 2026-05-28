'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, BookOpen, CheckCircle2, Gauge, Play, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import QuizResultsView from '@components/Objects/Activities/Quiz/Player/QuizResultsView'
import { LayeredCardCarousel } from '@components/Landings/DashboardActionHero'

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

function getActivityHref(orgslug: string, courseUuid: string, activityUuid?: string | null) {
  const cleanCourse = cleanCourseUuid(courseUuid)
  const cleanActivity = String(activityUuid || '').replace('activity_', '')
  if (!cleanActivity) return getUriWithOrg(orgslug, `/course/${cleanCourse}`)
  return getUriWithOrg(orgslug, `/course/${cleanCourse}/activity/${cleanActivity}`)
}

function getResultTitle(resultItem: any) {
  const resultJson = resultItem?.result?.result_json || {}
  const matched = resultJson?.matched_result
  const graded = resultJson?.graded_result
  if (matched?.title) return matched.title
  if (matched?.label) return matched.label
  if (graded) return graded.passed ? 'Passed' : 'Result ready'
  if (resultJson?.quiz_mode === 'ungraded') return 'Responses saved'
  return 'Result ready'
}

function getResultSubtext(resultItem: any) {
  const resultJson = resultItem?.result?.result_json || {}
  const matched = resultJson?.matched_result
  const graded = resultJson?.graded_result
  if (matched?.subtitle) return matched.subtitle
  if (graded) return `${Number(graded.score_percent || 0).toFixed(1)}% score`
  if (resultJson?.quiz_mode === 'ungraded') return resultItem?.activity?.name || 'Quiz response'
  return resultItem?.activity?.name || 'Completed quiz'
}

function ChapterResultCard({
  item,
  elevation,
  course,
}: {
  item: any
  elevation: number
  course: any
}) {
  const bgClass = (['bg-white', 'bg-gray-100', 'bg-gray-200'] as const)[Math.min(elevation, 2)]

  return (
    <div className={`h-[520px] w-[min(86vw,720px)] overflow-hidden rounded-2xl border border-gray-100 ${bgClass} shadow-xl`}>
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
          {item?.activity?.name || 'Quiz result'}
        </p>
        <h3 className="mt-1 text-lg font-bold text-gray-950">{getResultTitle(item)}</h3>
      </div>
      <div className="h-[440px] overflow-y-auto bg-white">
        <QuizResultsView
          result={item.result}
          activity={item.activity}
          org={{ org_uuid: course?.owner_org_uuid || course?.org_uuid }}
          course={{ courseStructure: { course_uuid: course?.course_uuid } }}
          onRetake={() => {}}
          showRetakeButton={false}
        />
      </div>
    </div>
  )
}

function ChapterResultsModal({
  chapter,
  course,
  orgslug,
  onClose,
}: {
  chapter: any
  course: any
  orgslug: string
  onClose: () => void
}) {
  const resultCards = chapter.completed_quiz_results || []
  const continueHref = getActivityHref(orgslug, course.course_uuid, chapter.next_activity?.activity_uuid)
  const complete = chapter.complete

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-stretch bg-black/50 p-0 sm:items-center sm:justify-center sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="relative flex h-full w-full flex-col overflow-y-auto bg-gray-50 sm:max-h-[92vh] sm:max-w-[920px] sm:rounded-2xl sm:shadow-2xl">
        <button
          type="button"
          aria-label="Close chapter results"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-md hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="border-b border-gray-200 bg-white px-5 py-5 sm:px-7">
          <div className="pr-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              {complete ? 'Chapter complete' : 'Chapter in progress'}
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-950">{chapter.name}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {chapter.completed_activities} of {chapter.total_activities} activities complete
                </p>
              </div>
              {!complete && chapter.next_activity ? (
                <Link
                  href={continueHref}
                  className="inline-flex w-fit items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar value={chapter.progress || 0} />
          </div>
        </div>

        <div className="flex-1 px-4 py-5 sm:px-7">
          {resultCards.length > 0 ? (
            <LayeredCardCarousel
              cards={resultCards}
              ariaLabel="chapter result"
              stageClassName="h-[560px]"
              previousButtonClassName="-translate-x-[410px]"
              nextButtonClassName="translate-x-[410px]"
              renderCard={(item, elevation) => (
                <ChapterResultCard item={item} elevation={elevation} course={course} />
              )}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-gray-800">No completed quiz results yet</p>
              <p className="mt-1 text-sm text-gray-500">Complete a quiz in this chapter to see its result card here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChapterDashboardTile({
  chapter,
  course,
  orgslug,
  onOpen,
}: {
  chapter: any
  course: any
  orgslug: string
  onOpen: () => void
}) {
  const started = chapter.completed_activities > 0
  const complete = chapter.complete
  const result = complete
    ? chapter.highlight_result || chapter.last_completed_result
    : chapter.last_completed_result
  const startHref = getActivityHref(
    orgslug,
    course.course_uuid,
    chapter.next_activity?.activity_uuid || chapter.quiz_activities?.[0]?.activity_uuid
  )

  if (!started) {
    return (
      <Link
        href={startHref}
        className="group flex aspect-square min-h-[180px] flex-col justify-between rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 transition hover:border-gray-300 hover:bg-white"
      >
        <div>
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-500 shadow-xs">
            <Play className="h-4 w-4" />
          </div>
          <h3 className="line-clamp-2 text-sm font-bold text-gray-900">{chapter.name}</h3>
          <p className="mt-2 text-xs text-gray-500">Not started</p>
        </div>
        <div className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
          Get started
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </div>
      </Link>
    )
  }

  return (
    <div className="flex aspect-square min-h-[180px] flex-col justify-between rounded-lg border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onOpen}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${complete ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-900'}`}
          >
            {complete ? <CheckCircle2 className="h-5 w-5" /> : <Gauge className="h-5 w-5" />}
          </button>
          {!complete && chapter.next_activity ? (
            <Link
              href={startHref}
              className="inline-flex items-center gap-1 rounded-full bg-gray-950 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-800"
            >
              Continue
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <div className="text-right">
              <div className="text-xl font-black text-gray-950">{chapter.progress}%</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">done</div>
            </div>
          )}
        </div>
        {!complete ? (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              <span>active</span>
              <span>{chapter.progress}%</span>
            </div>
            <div className="mt-1">
              <ProgressBar value={chapter.progress || 0} />
            </div>
          </div>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-bold text-gray-950">{chapter.name}</h3>
        <p className="mt-2 text-xs text-gray-500">
          {chapter.completed_activities} of {chapter.total_activities} activities
        </p>
      </div>
      <button type="button" onClick={onOpen} className="rounded-lg bg-gray-50 p-3 text-left hover:bg-gray-100">
        <p className="line-clamp-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {result ? result.activity?.name : 'Result'}
        </p>
        <p className="mt-1 line-clamp-2 text-sm font-semibold text-gray-800">
          {result ? getResultTitle(result) : 'No quiz result yet'}
        </p>
        {result ? (
          <p className="mt-1 line-clamp-1 text-xs text-gray-500">{getResultSubtext(result)}</p>
        ) : null}
      </button>
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
  const [selectedChapter, setSelectedChapter] = useState<{ chapter: any; course: any } | null>(null)

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

      <div className={isProfile ? 'grid gap-4' : 'grid gap-5'}>
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
            <section key={course.course_uuid} className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
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

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(item.chapters || []).slice(0, isProfile ? 4 : 6).map((chapter: any) => (
                  <ChapterDashboardTile
                    key={chapter.chapter_uuid || chapter.id}
                    chapter={chapter}
                    course={course}
                    orgslug={orgslug}
                    onOpen={() => setSelectedChapter({ chapter, course })}
                  />
                ))}
                {(item.chapters || []).length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-400">
                    <BookOpen className="h-4 w-4" />
                    No chapters yet
                  </div>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>
      {selectedChapter ? (
        <ChapterResultsModal
          chapter={selectedChapter.chapter}
          course={selectedChapter.course}
          orgslug={orgslug}
          onClose={() => setSelectedChapter(null)}
        />
      ) : null}
    </section>
  )
}
