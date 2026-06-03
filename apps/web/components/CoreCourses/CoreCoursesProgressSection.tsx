'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, BookOpen, Lock } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import QuizResultsView from '@components/Objects/Activities/Quiz/Player/QuizResultsView'
import { getCourseCoreBackgroundMediaDirectory, getCourseThumbnailMediaDirectory } from '@services/media/media'
import { defaultChapterIconName, getChannelIcon } from '@components/Resources/ResourceChannelStyle'

type CoreCourseProgressSectionProps = {
  orgslug: string
  variant?: 'dashboard' | 'profile'
  className?: string
  courseUuid?: string
  grid?: { w: number; h: number }
}

function cleanCourseUuid(courseUuid?: string) {
  return String(courseUuid || '').replace('course_', '')
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

function getCourseThumbnailUrl(course: any) {
  const orgUuid = course?.owner_org_uuid || course?.org_uuid
  if (!orgUuid || !course?.course_uuid || !course?.thumbnail_image) return null
  return getCourseThumbnailMediaDirectory(orgUuid, course.course_uuid, course.thumbnail_image)
}

function getCourseBackgroundUrl(course: any) {
  const orgUuid = course?.owner_org_uuid || course?.org_uuid
  const coreBackgroundImage = course?.seo?.core_background_image
  if (orgUuid && course?.course_uuid && coreBackgroundImage) {
    return getCourseCoreBackgroundMediaDirectory(orgUuid, course.course_uuid, coreBackgroundImage)
  }
  return getCourseThumbnailUrl(course)
}

function getCourseDescription(course: any) {
  return course?.description || course?.about || ''
}

function getCourseSectionId(courseUuid?: string) {
  return `life-domain-${cleanCourseUuid(courseUuid)}`
}

function scrollToCourseSection(courseUuid?: string) {
  const section = document.getElementById(getCourseSectionId(courseUuid))
  if (!section) return
  window.scrollTo({
    top: section.getBoundingClientRect().top + window.scrollY,
    behavior: 'smooth',
  })
}

function CourseDomainNav({ items, isLoading, compact = false }: { items: any[]; isLoading: boolean; compact?: boolean }) {
  if (!isLoading && items.length === 0) return null
  if (compact) return null

  return (
    <div className="mb-5">
      <h2 className="my-2 text-lg font-bold tracking-tight text-gray-900">
        Life Launching Domains
      </h2>
      <div className="flex justify-center gap-2 overflow-x-auto pb-1">
        {isLoading ? (
          [1, 2, 3].map((item) => (
            <div
              key={item}
              className="min-w-[160px] max-w-[220px] flex-1 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm"
            >
              <div className="h-20 animate-pulse bg-gray-100" />
              <div className="p-3">
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-gray-100" />
                <div className="mt-2 h-1 animate-pulse rounded-full bg-gray-100" />
                <div className="mt-3 space-y-1.5">
                  <div className="h-3 w-full animate-pulse rounded-full bg-gray-100" />
                  <div className="h-3 w-4/5 animate-pulse rounded-full bg-gray-100" />
                </div>
              </div>
            </div>
          ))
        ) : null}
        {items.map((item: any) => {
          const course = item.course || {}
          const thumbnailUrl = getCourseThumbnailUrl(course)
          const description = getCourseDescription(course)

          return (
            <button
              key={course.course_uuid}
              type="button"
              onClick={() => scrollToCourseSection(course.course_uuid)}
              className="group min-w-[160px] max-w-[220px] flex-1 overflow-hidden rounded-lg border border-gray-100 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md"
            >
              <div className="relative h-20 overflow-hidden bg-gray-100">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full bg-[linear-gradient(135deg,#111827,#334155)]" />
                )}
              </div>
              <div className="p-3">
                <h3 className="truncate text-sm font-bold text-gray-950">{course.name}</h3>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, item.progress || 0))}%` }}
                  />
                </div>
                {description ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-4 text-gray-500">
                    {description}
                  </p>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
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
  const description = getCourseDescription(course)

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
            {description ? (
              <p className="mt-3 text-sm leading-5 text-gray-700">
                {description}
              </p>
            ) : null}
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

function QuizDashboardCard({
  quiz,
  result,
  course,
  orgslug,
}: {
  quiz: any
  result: any
  course: any
  orgslug: string
}) {
  const ActivityIcon = getChannelIcon(quiz.icon || defaultChapterIconName)
  const quizHref = getActivityHref(orgslug, course.course_uuid, quiz.activity_uuid)

  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-900">
            <ActivityIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-gray-950">{quiz.name}</h3>
                {quiz.description ? (
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600">
                    {quiz.description}
                  </p>
                ) : null}
              </div>
              <Link
                href={quizHref}
                className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white px-4 pb-0 pt-4 sm:px-5 sm:pt-5">
        {result ? (
          <div className="core-quiz-result-scroll max-h-[620px] overflow-y-auto">
            <style jsx global>{`
              .core-quiz-result-scroll {
                scrollbar-width: none;
              }
              .core-quiz-result-scroll:hover {
                scrollbar-width: thin;
                scrollbar-color: #d4d4d8 transparent;
              }
              .core-quiz-result-scroll::-webkit-scrollbar {
                width: 0;
                height: 0;
              }
              .core-quiz-result-scroll:hover::-webkit-scrollbar {
                width: 6px;
                height: 6px;
              }
              .core-quiz-result-scroll:hover::-webkit-scrollbar-thumb {
                background: #d4d4d8;
                border-radius: 999px;
              }
              .core-quiz-result-scroll:hover::-webkit-scrollbar-track {
                background: transparent;
              }
            `}</style>
            <QuizResultsView
              result={result.result}
              activity={result.activity}
              org={{ org_uuid: course?.owner_org_uuid || course?.org_uuid }}
              course={{ courseStructure: { course_uuid: course?.course_uuid } }}
              onRetake={() => {}}
              showRetakeButton={false}
              sectionedContent
            />
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-400 shadow-xs">
              <Lock className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-800">{quiz.name || 'Result locked'}</p>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Complete this quiz activity to unlock its response card here.
            </p>
            <Link
              href={quizHref}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

function ChapterSeparator({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <div className="h-px flex-1 bg-gray-950/20" />
      <span className="text-xs font-bold uppercase tracking-[0.22em] text-gray-950">
        {title}
      </span>
      <div className="h-px flex-1 bg-gray-950/20" />
    </div>
  )
}

function ChapterQuizCards({ chapter, course, orgslug }: { chapter: any; course: any; orgslug: string }) {
  const quizzes = chapter.quiz_activities || []
  if (quizzes.length === 0) return null
  return (
    <div className="grid gap-4">
      <ChapterSeparator title={chapter.name} />
      {quizzes.map((quiz: any) => (
        <QuizDashboardCard
          key={quiz.activity_uuid || quiz.id}
          quiz={quiz}
          result={getResultForQuiz(chapter, quiz)}
          course={course}
          orgslug={orgslug}
        />
      ))}
    </div>
  )
}

function hasQuizCards(item: any) {
  return (item.chapters || []).some((chapter: any) => (chapter.quiz_activities || []).length > 0)
}

function CourseDashboardCards({ item, course, orgslug }: { item: any; course: any; orgslug: string }) {
  if (!hasQuizCards(item)) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white p-3 text-xs text-gray-400">
        <BookOpen className="h-4 w-4" />
        No quiz response cards yet
      </div>
    )
  }
  return (
    <>
      {(item.chapters || []).map((chapter: any) => (
        <ChapterQuizCards
          key={chapter.chapter_uuid || chapter.id || chapter.name}
          chapter={chapter}
          course={course}
          orgslug={orgslug}
        />
      ))}
    </>
  )
}

function CourseDomainSection({
  course,
  item,
  orgslug,
  backgroundUrl,
  profileGrid,
}: {
  course: any
  item: any
  orgslug: string
  backgroundUrl: string | null
  profileGrid?: { w: number; h: number }
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const [bgH, setBgH] = useState(0)
  const isProfileGrid = Boolean(profileGrid)
  const isCompact = profileGrid?.h === 1
  const isNarrow = profileGrid?.w === 1
  const courseHref = getUriWithOrg(orgslug, `/course/${cleanCourseUuid(course.course_uuid)}`)
  const description = getCourseDescription(course)

  useEffect(() => {
    if (isProfileGrid) return
    const section = sectionRef.current
    if (!section) return
    const update = () => {
      setBgH(Math.min(section.offsetHeight, window.innerHeight))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(section)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [isProfileGrid])

  if (isCompact) {
    return (
      <section className="flex h-full min-w-0 items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-950">{course.name || 'CORE course'}</h2>
          <p className="mt-1 truncate text-sm font-medium text-gray-500">
            {item.completed_activities || 0}/{item.total_activities || 0} complete
          </p>
        </div>
        <Link
          href={courseHref}
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-gray-950 px-3 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Open
        </Link>
      </section>
    )
  }

  if (isProfileGrid) {
    return (
      <section className="flex h-full min-w-0 min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className={`${isNarrow ? 'p-4' : 'p-5'} border-b border-gray-100`}>
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-900">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className={`${isNarrow ? 'text-lg' : 'text-xl'} truncate font-bold text-gray-950`}>
                {course.name || 'CORE course'}
              </h2>
              {description && !isNarrow ? (
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600">{description}</p>
              ) : null}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.max(0, Math.min(100, item.progress || 0))}%` }}
                />
              </div>
            </div>
            <Link
              href={courseHref}
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-gray-950 px-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              {isNarrow ? 'Open' : 'Explore'}
            </Link>
          </div>
        </div>
        <div className={`${isNarrow ? 'grid gap-3 overflow-y-auto p-4' : 'flex gap-3 overflow-x-auto p-4'} min-h-0 flex-1`}>
          {(item.chapters || []).flatMap((chapter: any) =>
            (chapter.quiz_activities || []).map((quiz: any) => {
              const ActivityIcon = getChannelIcon(quiz.icon || defaultChapterIconName)
              const result = getResultForQuiz(chapter, quiz)
              const quizHref = getActivityHref(orgslug, course.course_uuid, quiz.activity_uuid)
              return (
                <Link
                  key={quiz.activity_uuid || quiz.id}
                  href={quizHref}
                  className={`${isNarrow ? 'w-full' : 'w-56 min-w-56'} rounded-lg border border-gray-100 bg-gray-50 p-3 text-left hover:bg-gray-100`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-800 shadow-xs">
                      <ActivityIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-950">{quiz.name || 'Untitled quiz'}</p>
                      <p className="mt-0.5 text-xs font-medium text-gray-500">{result ? 'Completed' : 'Not completed'}</p>
                    </div>
                  </div>
                </Link>
              )
            })
          )}
          {!hasQuizCards(item) ? (
            <div className="flex h-full min-h-24 flex-1 items-center rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No quiz response cards yet
            </div>
          ) : null}
        </div>
      </section>
    )
  }

  const bgHeight = bgH > 0 ? `${bgH}px` : '100vh'
  const negMargin = bgH > 0 ? `-${bgH}px` : '-100vh'

  return (
    <section
      ref={sectionRef}
      id={getCourseSectionId(course.course_uuid)}
      className="relative scroll-mt-0 overflow-visible shadow-sm"
    >
      <div
        style={{ height: bgHeight }}
        className="sticky top-0 z-0 min-h-[560px] overflow-hidden bg-gray-950"
      >
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt=""
            className="h-full w-full object-cover object-left-bottom"
          />
        ) : (
          <div className="h-full w-full bg-[linear-gradient(135deg,#111827,#334155)]" />
        )}
      </div>
      <div
        style={{ marginTop: negMargin }}
        className="relative z-10 grid gap-4 p-3 lg:grid-cols-[minmax(260px,320px)_1fr] lg:items-start lg:gap-5"
      >
        <StickyCourseIdentity course={course} item={item} orgslug={orgslug} />
        <div className="grid gap-4 pt-8 lg:pt-14">
          <CourseDashboardCards item={item} course={course} orgslug={orgslug} />
        </div>
      </div>
    </section>
  )
}

export default function CoreCoursesProgressSection({
  orgslug,
  variant = 'dashboard',
  className = '',
  courseUuid,
  grid,
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
    <section className={`${isProfile ? 'h-full min-w-0 min-h-0' : 'flex flex-col space-y-2 mb-6'} ${className}`}>
      <CourseDomainNav items={coreCourses} isLoading={isLoading} compact={isProfile} />

      <div className={`${isProfile ? 'h-full min-h-0' : 'grid gap-0'}`}>
        {isLoading ? (
          (courseUuid ? [1] : [1, 2]).map((item) => (
            <div key={item} className="h-full rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
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
          const backgroundUrl = getCourseBackgroundUrl(course)
          return (
            <CourseDomainSection
              key={course.course_uuid}
              course={course}
              item={item}
              orgslug={orgslug}
              backgroundUrl={backgroundUrl}
              profileGrid={isProfile ? grid : undefined}
            />
          )
        })}
      </div>
    </section>
  )
}
