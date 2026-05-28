'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, BookOpen, Lock } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import QuizResultsView from '@components/Objects/Activities/Quiz/Player/QuizResultsView'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { defaultChapterIconName, getChannelIcon } from '@components/Resources/ResourceChannelStyle'

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

function getResultForQuiz(chapter: any, quiz: any) {
  return (
    (chapter.completed_quiz_results || []).find(
      (item: any) => item?.activity?.activity_uuid === quiz?.activity_uuid
    ) || null
  )
}

function getInitialActiveQuizUuid(chapter: any) {
  const highlightUuid = chapter.highlight_result?.activity?.activity_uuid
  const lastUuid = chapter.last_completed_result?.activity?.activity_uuid
  return highlightUuid || lastUuid || chapter.quiz_activities?.[0]?.activity_uuid || ''
}

function getCourseThumbnailUrl(course: any) {
  const orgUuid = course?.owner_org_uuid || course?.org_uuid
  if (!orgUuid || !course?.course_uuid || !course?.thumbnail_image) return null
  return getCourseThumbnailMediaDirectory(orgUuid, course.course_uuid, course.thumbnail_image)
}

function StickyCourseIdentity({
  course,
  item,
  orgslug,
}: {
  course: any
  item: any
  orgslug: string
}) {
  const courseHref = getUriWithOrg(orgslug, `/course/${cleanCourseUuid(course.course_uuid)}`)

  return (
    <aside className="lg:sticky lg:top-0 lg:self-start">
      <div className="relative flex p-5 text-gray-950">
        <div className="flex w-full flex-col">
          <h3 className="text-2xl font-black leading-tight text-gray-950 lg:text-3xl">
            {course.name}
          </h3>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-800">
              <span>overall progress</span>
              <span>{item.completed_activities}/{item.total_activities}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/15">
              <div
                className="h-full rounded-full bg-gray-950 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, item.progress || 0))}%` }}
              />
            </div>
          </div>
          <Link
            href={courseHref}
            className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Explore
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </aside>
  )
}

function ChapterDashboardCard({
  chapter,
  course,
  orgslug,
  activeQuizUuid,
  setActiveQuizUuid,
}: {
  chapter: any
  course: any
  orgslug: string
  activeQuizUuid?: string
  setActiveQuizUuid: (chapterKey: string, quizUuid: string) => void
}) {
  const started = chapter.completed_activities > 0
  const complete = chapter.complete
  const chapterKey = chapter.chapter_uuid || String(chapter.id)
  const quizzes = chapter.quiz_activities || []
  const resolvedActiveQuizUuid = activeQuizUuid || getInitialActiveQuizUuid(chapter)
  const activeQuiz = quizzes.find((quiz: any) => quiz.activity_uuid === resolvedActiveQuizUuid) || quizzes[0]
  const activeResult = activeQuiz ? getResultForQuiz(chapter, activeQuiz) : null
  const ChapterIcon = getChannelIcon(chapter.icon || defaultChapterIconName)
  const continueHref = getActivityHref(
    orgslug,
    course.course_uuid,
    chapter.next_activity?.activity_uuid || activeQuiz?.activity_uuid
  )

  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              complete
                ? 'bg-emerald-50 text-gray-900'
                : started
                  ? 'bg-gray-100 text-gray-900'
                  : 'bg-gray-50 text-gray-500'
            }`}
          >
            <ChapterIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-gray-950">{chapter.name}</h3>
                {chapter.description ? (
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600">
                    {chapter.description}
                  </p>
                ) : null}
              </div>
              {chapter.next_activity || !started ? (
                <Link
                  href={continueHref}
                  className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  {started ? 'Continue' : 'Get started'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            <div className="mt-4">
              <ProgressBar value={chapter.progress || 0} />
            </div>
          </div>
        </div>
      </div>

      {quizzes.length > 0 ? (
        <div>
          <div className="flex overflow-x-auto border-b border-gray-200 bg-white px-4">
            {quizzes.map((quiz: any, index: number) => {
              const active = quiz.activity_uuid === activeQuiz?.activity_uuid
              return (
                <button
                  key={quiz.activity_uuid || quiz.id}
                  type="button"
                  onClick={() => setActiveQuizUuid(chapterKey, quiz.activity_uuid)}
                  className={`min-w-36 flex-1 border-b-2 px-4 py-3 text-center text-xs font-bold transition-colors ${
                    active
                      ? 'border-emerald-600 text-gray-950'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span className="block truncate">{quiz.name || `Response ${index + 1}`}</span>
                </button>
              )
            })}
          </div>

          <div className="bg-white p-4 sm:p-5">
            {activeResult ? (
              <div className="max-h-[620px] overflow-y-auto">
                <QuizResultsView
                  result={activeResult.result}
                  activity={activeResult.activity}
                  org={{ org_uuid: course?.owner_org_uuid || course?.org_uuid }}
                  course={{ courseStructure: { course_uuid: course?.course_uuid } }}
                  onRetake={() => {}}
                  showRetakeButton={false}
                  sectionedContent
                />
              </div>
            ) : activeQuiz ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-400 shadow-xs">
                  <Lock className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-gray-800">{activeQuiz.name || 'Result locked'}</p>
                <p className="mt-1 max-w-md text-sm text-gray-500">
                  Complete this quiz activity to unlock its response card here.
                </p>
                {chapter.next_activity ? (
                  <Link
                    href={continueHref}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                  >
                    {started ? 'Continue chapter' : 'Start chapter'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-400">
            <BookOpen className="h-4 w-4" />
            No quiz response cards in this chapter yet.
          </div>
        </div>
      )}
    </section>
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
  const [activeQuizByChapter, setActiveQuizByChapter] = useState<Record<string, string>>({})

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
  const setChapterQuiz = (chapterKey: string, quizUuid: string) => {
    setActiveQuizByChapter((current) => ({ ...current, [chapterKey]: quizUuid }))
  }

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

      <div className="grid gap-0">
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
          const thumbnailUrl = getCourseThumbnailUrl(course)

          return (
            <section
              key={course.course_uuid}
              className="relative overflow-visible shadow-sm"
            >
              <div className="sticky top-0 z-0 h-screen min-h-[560px] overflow-hidden bg-gray-950">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,#111827,#334155)]" />
                )}
              </div>

              <div className="relative z-10 -mt-[100vh] grid gap-4 p-3 lg:grid-cols-[minmax(260px,320px)_1fr] lg:items-start lg:gap-5">
                <StickyCourseIdentity course={course} item={item} orgslug={orgslug} />

                <div className="grid gap-4 pt-8 lg:pt-14">
                  {(item.chapters || []).map((chapter: any) => {
                    const chapterKey = chapter.chapter_uuid || String(chapter.id)
                    return (
                      <ChapterDashboardCard
                        key={chapterKey}
                        chapter={chapter}
                        course={course}
                        orgslug={orgslug}
                        activeQuizUuid={activeQuizByChapter[chapterKey]}
                        setActiveQuizUuid={setChapterQuiz}
                      />
                    )
                  })}
                  {(item.chapters || []).length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white p-3 text-xs text-gray-400">
                      <BookOpen className="h-4 w-4" />
                      No chapters yet
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}
