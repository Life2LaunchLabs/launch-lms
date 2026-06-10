'use client'
import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getUriWithOrg, getAPIUrl, routePaths } from '@services/config/config'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { swrFetcher } from '@services/utils/ts/requests'
import ActivityIndicators from '@components/Pages/Courses/ActivityIndicators'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import {
  getCourseThumbnailMediaDirectory,
} from '@services/media/media'
import { CourseThumbnailImage } from '@components/Objects/Thumbnails/CourseThumbnailImage'
import { ArrowLeft, ArrowRight, Award, BookOpenCheck, Check, CircleHelp, Clock, FileText, Layers, Play, Video, Image as ImageIcon } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import CourseCommunitySection from '@components/Objects/Communities/CourseCommunitySection'
import CourseShare from '@components/Objects/Courses/CourseShare/CourseShare'
import { useAnalytics } from '@/hooks/useAnalytics'
import {
  ContainerBreakpointProvider,
  useContainerBreakpoints,
} from '@components/Contexts/ContainerBreakpointContext'
import ActivityCourseOutline from '@components/Pages/Activity/ActivityCourseOutline'

const CourseClient = (props: any) => {
  const { t } = useTranslation()
  const [preferredThumbnailType, setPreferredThumbnailType] = useState<'image' | 'video' | null>(null)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [isDescriptionTall, setIsDescriptionTall] = useState(false)
  const descriptionRef = useRef<HTMLParagraphElement>(null)
  const courseuuid = props.courseuuid
  const orgslug = props.orgslug
  const initialCourse = props.course
  const serverError = props.serverError
  const quickstartMode = props.quickstartMode === true
  const org = useOrg() as any
  const session = useLHSession() as any;
  const access_token = session?.data?.tokens?.access_token;

  // Fetch course data client-side if server didn't provide it (e.g., auth failed on server)
  const { data: clientCourseData, error: courseError, isLoading: courseLoading } = useSWR(
    // Only fetch if we don't have initial course data AND we have a session token AND no server error
    !initialCourse && !serverError && access_token
      ? `${getAPIUrl()}courses/course_${courseuuid}/meta`
      : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  );

  // Use server-provided course data, or client-fetched data as fallback
  const course = initialCourse || clientCourseData;
  const courseOwnerOrgId = course?.owner_org_id || org?.id
  const courseOwnerOrgUuid = course?.owner_org_uuid || org?.org_uuid

  const { track } = useAnalytics()

  // Track course view
  const courseId = course?.id
  const courseUuidForTracking = course?.course_uuid
  useEffect(() => {
    if (courseId && courseUuidForTracking) {
      track('course_view', {
        course_uuid: courseUuidForTracking,
      })
    }
  }, [courseId, courseUuidForTracking, track])

  // Add SWR for trail data
  const { data: trailData } = useSWR(
    courseOwnerOrgId ? `${getAPIUrl()}trail/org/${courseOwnerOrgId}/trail` : null,
    (url) => swrFetcher(url, access_token)
  );

  const activeError = serverError || courseError

  const isActivityDone = useCallback((activity: any) => {
    const cleanCourseUuid = course?.course_uuid?.replace('course_', '')
    const run = trailData?.runs?.find(
      (run: any) => {
        const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '')
        return cleanRunCourseUuid === cleanCourseUuid
      }
    )

    if (run) {
      return run.steps.find((step: any) => step.activity_id == activity.id)
    }
    return false
  }, [course?.course_uuid, trailData])

  useEffect(() => {
    if (descriptionRef.current) {
      setIsDescriptionTall(descriptionRef.current.scrollHeight > 400)
    }
  }, [course?.about])

  const defaultThumbnailType = useMemo(() => {
    if (!course) return 'image'
    if ((course.thumbnail_type === 'both' || course.thumbnail_type === 'video') && course.thumbnail_video) {
      return 'video'
    }
    return 'image'
  }, [course])

  const activeThumbnailType = useMemo(() => {
    const fallback = defaultThumbnailType
    if (!preferredThumbnailType) return fallback
    if (preferredThumbnailType === 'video' && !course?.thumbnail_video) return fallback
    return preferredThumbnailType
  }, [course?.thumbnail_video, defaultThumbnailType, preferredThumbnailType])

  const learnings = useMemo(() => {
    if (!course?.learnings) return []

    try {
      const parsedLearnings = JSON.parse(course.learnings)
      if (Array.isArray(parsedLearnings)) {
        return parsedLearnings
      }
    } catch {
      // Not valid JSON, continue to legacy format handling
    }

    return course.learnings.split(',').map((text: string, idx: number) => ({
      id: `learning-${idx}-${text.trim().toLowerCase().replace(/\s+/g, '-')}`,
      text: text.trim(),
      emoji: '📝',
    }))
  }, [course])

  const getNextActivity = () => {
    if (!course?.chapters) return null
    for (const chapter of course.chapters) {
      for (const activity of chapter.activities) {
        if (!isActivityDone(activity)) return activity
      }
    }
    return course.chapters[0]?.activities[0] ?? null
  }

  const nextActivity = getNextActivity()
  const run = useMemo(() => {
    const cleanCourseUuid = course?.course_uuid?.replace('course_', '')
    return trailData?.runs?.find((trailRun: any) => (
      trailRun.course?.course_uuid?.replace('course_', '') === cleanCourseUuid
    ))
  }, [course?.course_uuid, trailData])
  const totalActivities = useMemo(
    () => course?.chapters?.reduce(
      (total: number, chapter: any) => total + (chapter.activities?.length || 0),
      0
    ) || 0,
    [course?.chapters]
  )
  const completedActivities = run?.steps?.filter((step: any) => step.complete !== false).length || 0
  const isCompleted = totalActivities > 0 && completedActivities >= totalActivities
  const coursePath = quickstartMode
    ? routePaths.org.quickstartCourse(courseuuid)
    : routePaths.org.course(courseuuid)
  const getActivityPath = (activityUuid: string) =>
    quickstartMode
      ? routePaths.org.quickstartCourseActivity(courseuuid, activityUuid)
      : routePaths.org.courseActivity(courseuuid, activityUuid)
  const nextActivityRoute = nextActivity
    ? getUriWithOrg(
        orgslug,
        getActivityPath(nextActivity.activity_uuid.replace('activity_', ''))
      )
    : null

  // Generate JSON-LD structured data for SEO
  const generateJsonLd = () => {
    if (!course || !org) return null
    const seo = course.seo || {}

    // Check if JSON-LD is enabled (defaults to true if not set)
    if (seo.enable_jsonld === false) return null

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: seo.title || course.name,
      description: seo.description || course.description || '',
      provider: {
        '@type': 'Organization',
        name: org.name,
        ...(org.description && { description: org.description }),
      },
      ...(course.thumbnail_image && {
        image: getCourseThumbnailMediaDirectory(
          courseOwnerOrgUuid,
          course?.course_uuid,
          course?.thumbnail_image
        ),
      }),
      ...(course.creation_date && { dateCreated: course.creation_date }),
      ...(course.update_date && { dateModified: course.update_date }),
    }

    return jsonLd
  }

  const jsonLd = generateJsonLd()

  if (!initialCourse && !serverError && courseLoading) {
    return <PageLoading />
  }

  if (!course && activeError) {
    return (
      <GeneralWrapperStyled>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            {t('course.accessDenied', 'Unable to access this course')}
          </h2>
          <p className="text-gray-500 mb-4">
            {activeError?.status === 403
              ? t('course.noPermission', 'You do not have permission to view this course.')
              : t('course.loadError', 'This course could not be found or there was an error loading it.')}
          </p>
          <Link href={getUriWithOrg(orgslug, '/badges')} className="text-blue-600 hover:underline">
            Back to Badges
          </Link>
        </div>
      </GeneralWrapperStyled>
    )
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {!course && !org ? (
        <PageLoading></PageLoading>
      ) : (
        <>
          <GeneralWrapperStyled>
            <div className="mb-10">
              <Link
                href={getUriWithOrg(orgslug, routePaths.org.badges())}
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-950"
              >
                <ArrowLeft size={16} />
                Back
              </Link>
            </div>

            {!quickstartMode && !run ? (
              <BadgePreviewHero
                course={course}
                courseOwnerOrgUuid={courseOwnerOrgUuid}
                nextActivityRoute={nextActivityRoute}
                learnings={learnings}
                t={t}
                comingSoon={!!course.coming_soon}
              />
            ) : !quickstartMode && !isCompleted ? (
              <BadgePathView
                course={course}
                courseOwnerOrgUuid={courseOwnerOrgUuid}
                orgslug={orgslug}
                run={run}
              />
            ) : (
              <>
                <div className="pb-2">
                  <h1 className="text-3xl font-bold">{course.name}</h1>
                </div>
                <ContainerBreakpointProvider
                  breakpoints={{
                    stacked: 0,
                    split: 980,
                    spacious: 1240,
                  }}
                  className="pt-2"
                >
                  <CourseDetailResponsiveSection
                    course={course}
                    courseuuid={courseuuid}
                    orgslug={orgslug}
                    courseOwnerOrgUuid={courseOwnerOrgUuid}
                    activeThumbnailType={activeThumbnailType}
                    setActiveThumbnailType={setPreferredThumbnailType}
                    trailData={trailData}
                    nextActivityRoute={nextActivityRoute}
                    nextActivity={nextActivity}
                    learnings={learnings}
                    isDescriptionTall={isDescriptionTall}
                    descriptionExpanded={descriptionExpanded}
                    setDescriptionExpanded={setDescriptionExpanded}
                    descriptionRef={descriptionRef}
                    t={t}
                    quickstartMode={quickstartMode}
                    coursePath={coursePath}
                    getActivityPath={getActivityPath}
                    comingSoon={!!course.coming_soon}
                  />

                  <CourseCommunitySection courseUuid={course.course_uuid} orgslug={orgslug} />
                </ContainerBreakpointProvider>
              </>
            )}
          </GeneralWrapperStyled>

        </>
      )}
    </>
  )
}

function getPathActivityIcon(activityType: string) {
  switch (activityType) {
    case 'TYPE_VIDEO':
      return Video
    case 'TYPE_DYNAMIC':
      return Layers
    case 'TYPE_ASSIGNMENT':
      return BookOpenCheck
    case 'TYPE_QUIZ':
      return CircleHelp
    default:
      return FileText
  }
}

function BadgePathView({ course, courseOwnerOrgUuid, orgslug, run }: any) {
  const activities = useMemo(
    () => course.chapters?.flatMap((chapter: any) => chapter.activities || []) || [],
    [course.chapters]
  )
  const completedIds = useMemo(
    () => new Set(
      (run?.steps || [])
        .filter((step: any) => step.complete !== false)
        .map((step: any) => step.activity_id)
    ),
    [run?.steps]
  )
  const nextActivityIndex = activities.findIndex((activity: any) => !completedIds.has(activity.id))
  const [activeIndex, setActiveIndex] = useState(nextActivityIndex >= 0 ? nextActivityIndex : 0)
  const completedCount = completedIds.size
  const progressPercent = activities.length > 0 ? (completedCount / activities.length) * 100 : 0

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2 lg:gap-14">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-50">
              {course.thumbnail_image && courseOwnerOrgUuid ? (
                <img
                  src={getCourseThumbnailMediaDirectory(
                    courseOwnerOrgUuid,
                    course.course_uuid,
                    course.thumbnail_image
                  )}
                  alt={course.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-300">
                  <Award size={30} strokeWidth={1.4} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight text-gray-950">{course.name}</h1>
              {(course.description || course.about) && (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-500">
                  {course.description || course.about}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
              <span>Progress</span>
              <span className="tabular-nums">{completedCount}/{activities.length}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </aside>

      <div className="space-y-3">
        {activities.map((activity: any, index: number) => {
          const isCompletedActivity = completedIds.has(activity.id)
          const isNext = index === nextActivityIndex
          const isAvailable = isCompletedActivity || isNext
          const isActive = index === activeIndex && isAvailable
          const Icon = getPathActivityIcon(activity.activity_type)
          const activityHref = getUriWithOrg(
            orgslug,
            routePaths.org.courseActivity(
              course.course_uuid.replace('course_', ''),
              activity.activity_uuid.replace('activity_', '')
            )
          )

          return (
            <div
              key={activity.activity_uuid}
              className={`rounded-lg bg-white transition-all ${
                isNext
                  ? `border-2 border-green-500 ${isActive ? '-translate-y-1 shadow-lg' : 'shadow-sm'}`
                  : isCompletedActivity
                    ? `border border-gray-200 ${isActive ? '-translate-y-0.5 shadow-md' : ''}`
                    : 'border border-gray-100 bg-gray-50/60'
              }`}
            >
              <button
                type="button"
                disabled={!isAvailable}
                onClick={() => setActiveIndex(index)}
                className="flex w-full items-center gap-4 px-4 py-4 text-left disabled:cursor-default"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  isAvailable ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-300'
                }`}>
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${isAvailable ? 'text-gray-950' : 'text-gray-400'}`}>
                    {activity.name}
                  </p>
                  <p className={`mt-0.5 text-xs font-medium ${
                    isNext ? 'text-green-600' : isCompletedActivity ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    {isNext ? 'Next up' : isCompletedActivity ? 'Completed' : 'Not started'}
                  </p>
                </div>
              </button>

              {isActive && (
                <div className="px-4 pb-4 pl-[4.5rem]">
                  <Link
                    href={activityHref}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      isNext
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isNext ? 'Get started' : 'Review'}
                    <ArrowRight size={15} />
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function BadgePreviewHero({
  course,
  courseOwnerOrgUuid,
  nextActivityRoute,
  learnings,
  t,
  comingSoon,
}: any) {
  const tags = typeof course.tags === 'string'
    ? course.tags.split('|').map((tag: string) => tag.trim()).filter(Boolean)
    : Array.isArray(course.tags)
      ? course.tags.map((tag: any) => typeof tag === 'string' ? tag : tag.name).filter(Boolean)
      : []

  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] lg:gap-14">
      <div className="order-1">
        <h1 className="text-4xl font-semibold leading-tight text-gray-950 sm:text-5xl">
          {course.name}
        </h1>
      </div>

      <div className="order-2 row-span-2 w-full lg:col-start-2 lg:row-start-1 lg:row-end-3">
        <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-50">
          {course.thumbnail_image && courseOwnerOrgUuid ? (
            <img
              src={getCourseThumbnailMediaDirectory(
                courseOwnerOrgUuid,
                course.course_uuid,
                course.thumbnail_image
              )}
              alt={course.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300">
              <Award size={64} strokeWidth={1.25} />
            </div>
          )}
        </div>
      </div>

      <div className="order-3 space-y-7 lg:col-start-1 lg:row-start-2">
        {(course.about || course.description) && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              About
            </h2>
            <p className="whitespace-pre-line text-base leading-relaxed text-gray-600">
              {course.about || course.description}
            </p>
          </div>
        )}

        {learnings.length > 0 && learnings[0]?.text !== 'null' && (
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t('courses.what_you_will_learn')}
            </h2>
            <div className="space-y-2.5">
              {learnings.map((learning: any) => {
                const text = typeof learning === 'string' ? learning : learning.text
                if (!text) return null
                return (
                  <div key={learning.id || text} className="flex items-start gap-3 text-sm font-medium text-gray-700">
                    <Check className="mt-0.5 shrink-0 text-green-600" size={16} />
                    <span>{text}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag: string) => (
              <span key={tag} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}

        {comingSoon ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-orange-100 px-4 py-2.5 text-sm font-semibold text-orange-700">
            <Clock size={15} />
            {t('courses.coming_soon')}
          </span>
        ) : nextActivityRoute ? (
          <Link
            href={nextActivityRoute}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play size={15} fill="currentColor" />
            {t('courses.get_started')}
          </Link>
        ) : null}
      </div>
    </section>
  )
}

function CourseDetailResponsiveSection(props: any) {
  const {
    course,
    orgslug,
    courseOwnerOrgUuid,
    activeThumbnailType,
    setActiveThumbnailType,
    trailData,
    nextActivityRoute,
    nextActivity,
    learnings,
    isDescriptionTall,
    descriptionExpanded,
    setDescriptionExpanded,
    descriptionRef,
    t,
    quickstartMode,
    coursePath,
    getActivityPath,
    comingSoon,
  } = props

  const { atLeast } = useContainerBreakpoints()
  const isSplit = atLeast('split')
  const isSpacious = atLeast('spacious')
  const mediaFrameClass = isSplit
    ? 'h-[300px] w-full'
    : isSpacious
      ? 'h-[360px] w-full'
      : 'h-[220px] w-full sm:h-[300px]'

  return (
    <>
      <div className={`flex flex-col gap-8 items-start ${isSplit ? 'flex-row' : ''}`}>
        {!quickstartMode && isSplit ? (
          <aside className="hidden lg:block lg:w-[320px] lg:shrink-0">
            <div className="sticky top-28">
              {comingSoon ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-6 py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                    <Clock size={22} className="text-orange-500" />
                  </div>
                  <p className="text-sm font-bold text-orange-700">{t('courses.coming_soon')}</p>
                  <p className="text-xs text-orange-600/80">{t('courses.coming_soon_detail')}</p>
                </div>
              ) : (
                <ActivityCourseOutline
                  course={course}
                  orgslug={orgslug}
                  trailData={trailData}
                  courseHref={coursePath}
                  getActivityHref={getActivityPath}
                  variant="sidebar"
                  showCloseButton={false}
                  headerMode="summary"
                  highlightMode="next"
                  highlightedActivityId={nextActivity?.activity_uuid}
                  initialExpandedActivityId={nextActivity?.activity_uuid}
                />
              )}
            </div>
          </aside>
        ) : null}

        <div className={`w-full min-w-0 space-y-6 ${isSplit ? 'flex-1' : ''}`}>
          {(() => {
            const showVideo = course.thumbnail_type === 'video' || (course.thumbnail_type === 'both' && activeThumbnailType === 'video')
            const showImage = course.thumbnail_type === 'image' || (course.thumbnail_type === 'both' && activeThumbnailType === 'image') || !course.thumbnail_type

            if (showVideo && course.thumbnail_video) {
              return (
                <div className={`relative inset-0 ring-1 ring-inset ring-black/10 rounded-lg shadow-xl overflow-hidden ${mediaFrameClass}`}>
                  {course.thumbnail_type === 'both' && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="bg-black/20 backdrop-blur-sm rounded-lg p-1 flex space-x-1">
                        <button
                          onClick={() => setActiveThumbnailType('image')}
                          className={`flex items-center px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                            activeThumbnailType === 'image'
                              ? 'bg-white/90 text-gray-900 shadow-sm'
                              : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <ImageIcon size={12} className="mr-1" />
                          {t('courses.image')}
                        </button>
                        <button
                          onClick={() => setActiveThumbnailType('video')}
                          className={`flex items-center px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                            activeThumbnailType === 'video'
                              ? 'bg-white/90 text-gray-900 shadow-sm'
                              : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <Video size={12} className="mr-1" />
                          {t('activities.video')}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="w-full h-full">
                    <video
                      src={getCourseThumbnailMediaDirectory(
                        courseOwnerOrgUuid,
                        course?.course_uuid,
                        course?.thumbnail_video
                      )}
                      className="w-full h-full bg-black rounded-lg"
                      controls
                      autoPlay
                      muted
                      preload="metadata"
                      playsInline
                    />
                  </div>
                </div>
              )
            } else if (showImage && course.thumbnail_image) {
              return (
                <div className={`relative inset-0 ring-1 ring-inset ring-black/10 rounded-lg shadow-xl overflow-hidden bg-black ${mediaFrameClass}`}>
                  <CourseThumbnailImage
                    src={getCourseThumbnailMediaDirectory(
                      courseOwnerOrgUuid,
                      course?.course_uuid,
                      course?.thumbnail_image
                    )}
                    alt={course.name}
                  />
                  {course.thumbnail_type === 'both' && (
                    <div className="absolute top-3 right-3 z-20">
                      <div className="bg-black/20 backdrop-blur-sm rounded-lg p-1 flex space-x-1">
                        <button
                          onClick={() => setActiveThumbnailType('image')}
                          className={`flex items-center px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                            activeThumbnailType === 'image'
                              ? 'bg-white/90 text-gray-900 shadow-sm'
                              : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <ImageIcon size={12} className="mr-1" />
                          {t('courses.image')}
                        </button>
                        <button
                          onClick={() => setActiveThumbnailType('video')}
                          className={`flex items-center px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                            activeThumbnailType === 'video'
                              ? 'bg-white/90 text-gray-900 shadow-sm'
                              : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <Video size={12} className="mr-1" />
                          {t('activities.video')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            } else {
              return (
                <div className={`relative inset-0 ring-1 ring-inset ring-black/10 rounded-lg shadow-xl overflow-hidden bg-black ${mediaFrameClass}`}>
                  <CourseThumbnailImage src="/empty_thumbnail.png" alt={course.name} />
                </div>
              )
            }
          })()}

        {(() => {
          const cleanCourseUuid = course.course_uuid?.replace('course_', '')
          const run = trailData?.runs?.find(
            (run: any) => {
              const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '')
              return cleanRunCourseUuid === cleanCourseUuid
            }
          )
          return run
        })() && (
          <ActivityIndicators
            course_uuid={course.course_uuid}
            orgslug={orgslug}
            course={course}
            trailData={trailData}
          />
        )}

        <div className="flex items-center gap-2">
          {comingSoon ? (
            <span className="flex items-center gap-2 rounded-lg bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-700">
              <Clock size={14} />
              {t('courses.coming_soon')}
            </span>
          ) : nextActivityRoute ? (
            <Link
              href={nextActivityRoute}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Play size={14} fill="currentColor" />
              {t('courses.get_started')}
            </Link>
          ) : null}
          <CourseShare
            courseName={course.name}
            courseUrl={getUriWithOrg(orgslug, coursePath)}
            iconOnly
          />
        </div>

        <div className="course_metadata_left space-y-2">
          <div>
            <div
              className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={isDescriptionTall && !descriptionExpanded ? {
                maxHeight: '300px',
                WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
              } : undefined}
            >
              <p ref={descriptionRef} className="py-5 whitespace-pre-line break-words w-full leading-relaxed tracking-normal text-pretty hyphens-auto">{course.about}</p>
            </div>
            {isDescriptionTall && (
              <button
                onClick={() => setDescriptionExpanded((v: boolean) => !v)}
                className="mt-1 text-sm font-medium text-neutral-500 hover:text-neutral-800 transition-colors"
              >
                {descriptionExpanded ? t('common.show_less') : t('common.show_more')}
              </button>
            )}
          </div>
        </div>

        {learnings.length > 0 && learnings[0]?.text !== 'null' && (
          <div className="w-full">
            <h2 className="py-5 text-xl font-bold">{t('courses.what_you_will_learn')}</h2>
            <div className="bg-white shadow-md shadow-gray-300/25 outline outline-1 outline-neutral-200/40 rounded-lg overflow-hidden px-5 py-5 space-y-2">
              {learnings.map((learning: any) => {
                const learningText = typeof learning === 'string' ? learning : learning.text
                const learningEmoji = typeof learning === 'string' ? null : learning.emoji
                const learningId = typeof learning === 'string' ? learning : learning.id || learning.text
                if (!learningText) return null
                return (
                  <div
                    key={learningId}
                    className="flex space-x-2 items-center font-semibold text-gray-500"
                  >
                    <div className="px-2 py-2 rounded-full">
                      {learningEmoji ? (
                        <span>{learningEmoji}</span>
                      ) : (
                        <Check className="text-gray-400" size={15} />
                      )}
                    </div>
                    <p>{learningText}</p>
                    {learning.link && (
                      <a
                        href={learning.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline text-sm"
                      >
                        <span className="sr-only">Link to {learningText}</span>
                        <ArrowRight size={14} />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!quickstartMode && !isSplit ? (
          <div className="w-full">
            {comingSoon ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-6 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                  <Clock size={22} className="text-orange-500" />
                </div>
                <p className="text-sm font-bold text-orange-700">{t('courses.coming_soon')}</p>
                <p className="text-xs text-orange-600/80">{t('courses.coming_soon_detail')}</p>
              </div>
            ) : (
              <ActivityCourseOutline
                course={course}
                orgslug={orgslug}
                trailData={trailData}
                courseHref={coursePath}
                getActivityHref={getActivityPath}
                variant="sidebar"
                showCloseButton={false}
                headerMode="summary"
                highlightMode="next"
                highlightedActivityId={nextActivity?.activity_uuid}
                initialExpandedActivityId={nextActivity?.activity_uuid}
              />
            )}
          </div>
        ) : null}
        </div>
      </div>
    </>
  )
}

export default CourseClient
