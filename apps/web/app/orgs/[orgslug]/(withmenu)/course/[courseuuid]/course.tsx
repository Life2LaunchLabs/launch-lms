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
import { ArrowRight, Backpack, Check, File, StickyNote, Video, Image as ImageIcon, Layers, BookCopy, Play } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
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

const CourseClient = (props: any) => {
  const { t } = useTranslation()
  const [expandedChapters, setExpandedChapters] = useState<{[key: string]: boolean}>({})
  const [preferredThumbnailType, setPreferredThumbnailType] = useState<'image' | 'video' | null>(null)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [isDescriptionTall, setIsDescriptionTall] = useState(false)
  const descriptionRef = useRef<HTMLParagraphElement>(null)
  const courseuuid = props.courseuuid
  const orgslug = props.orgslug
  const initialCourse = props.course
  const serverError = props.serverError
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

  const defaultExpandedChapters = useMemo(() => {
    if (!course?.chapters || trailData === undefined) return {}

    let nextActivityChapterUuid: string | null = null
    outer: for (const chapter of course.chapters) {
      for (const activity of chapter.activities) {
        if (!isActivityDone(activity)) {
          nextActivityChapterUuid = chapter.chapter_uuid
          break outer
        }
      }
    }

    const defaults: {[key: string]: boolean} = {}
    course.chapters.forEach((chapter: any, idx: number) => {
      defaults[chapter.chapter_uuid] = nextActivityChapterUuid
        ? chapter.chapter_uuid === nextActivityChapterUuid
        : idx === 0
    })

    return defaults
  }, [course, isActivityDone, trailData])

  const getActivityTypeLabel = (activityType: string) => {
    switch (activityType) {
      case 'TYPE_VIDEO':
        return t('activities.video')
      case 'TYPE_DOCUMENT':
        return t('activities.document')
      case 'TYPE_DYNAMIC':
        return t('activities.page')
      case 'TYPE_ASSIGNMENT':
        return t('activities.assignment')
      default:
        return t('activities.learning_material')
    }
  }

  const isActivityCurrent = (activity: any) => {
    const activity_uuid = activity.activity_uuid.replace('activity_', '')
    if (props.current_activity && props.current_activity == activity_uuid) {
      return true
    }
    return false
  }

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
  const nextActivityRoute = nextActivity
    ? getUriWithOrg(
        orgslug,
        routePaths.org.courseActivity(
          courseuuid,
          nextActivity.activity_uuid.replace('activity_', '')
        )
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
          <Link href={getUriWithOrg(orgslug, '/courses')} className="text-blue-600 hover:underline">
            {t('course.backToCourses', 'Back to Courses')}
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
            <div className="pb-4">
              <Breadcrumbs items={[
                { label: t('courses.courses'), href: getUriWithOrg(orgslug, '/courses'), icon: <BookCopy size={14} /> },
                { label: course.name }
              ]} />
            </div>
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
                expandedChapters={expandedChapters}
                defaultExpandedChapters={defaultExpandedChapters}
                setExpandedChapters={setExpandedChapters}
                isActivityDone={isActivityDone}
                isActivityCurrent={isActivityCurrent}
                getActivityTypeLabel={getActivityTypeLabel}
                t={t}
              />

              {/* Community Section */}
              <CourseCommunitySection courseUuid={course.course_uuid} orgslug={orgslug} />
            </ContainerBreakpointProvider>
          </GeneralWrapperStyled>

        </>
      )}
    </>
  )
}

function CourseDetailResponsiveSection(props: any) {
  const {
    course,
    courseuuid,
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
    expandedChapters,
    defaultExpandedChapters,
    setExpandedChapters,
    isActivityDone,
    isActivityCurrent,
    getActivityTypeLabel,
    t,
  } = props

  const { atLeast } = useContainerBreakpoints()
  const isSplit = atLeast('split')
  const isSpacious = atLeast('spacious')
  const mediaFrameClass = isSplit
    ? 'h-[180px] w-[320px]'
    : isSpacious
      ? 'h-[360px] w-full'
      : 'h-[220px] w-full sm:h-[300px]'

  return (
    <div className={`flex flex-col gap-8 items-start ${isSplit ? 'flex-row' : ''}`}>
      <div className={`w-full space-y-4 ${isSplit ? 'max-w-[360px] shrink-0' : ''}`}>
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
              <div className={`relative inset-0 ring-1 ring-inset ring-black/10 rounded-lg shadow-xl overflow-hidden bg-gray-100 ${mediaFrameClass}`}>
                <img
                  src={getCourseThumbnailMediaDirectory(
                    courseOwnerOrgUuid,
                    course?.course_uuid,
                    course?.thumbnail_image
                  )}
                  alt={course.name}
                  className="w-full h-full object-contain bg-gray-100"
                />
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
              </div>
            )
          } else {
            return (
              <div className={`relative inset-0 ring-1 ring-inset ring-black/10 rounded-lg shadow-xl overflow-hidden bg-gray-100 ${mediaFrameClass}`}>
                <img
                  src="/empty_thumbnail.png"
                  alt={course.name}
                  className="w-full h-full object-contain bg-gray-100"
                />
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
          {nextActivityRoute && (
            <Link
              href={nextActivityRoute}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-colors"
            >
              <Play size={14} fill="currentColor" />
              {t('courses.get_started')}
            </Link>
          )}
          <CourseShare
            courseName={course.name}
            courseUrl={getUriWithOrg(orgslug, routePaths.org.course(courseuuid))}
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
      </div>

      <div className={`mb-10 w-full space-y-3 ${isSplit ? 'flex-1' : ''}`}>
        {course.chapters.map((chapter: any, idx: number) => {
          const isExpanded = expandedChapters[chapter.chapter_uuid] ?? defaultExpandedChapters[chapter.chapter_uuid] ?? false
          return (
            <div
              key={chapter.chapter_uuid || `chapter-${chapter.name}`}
              className={`bg-white outline outline-1 outline-neutral-200/40 rounded-lg overflow-hidden transition-shadow duration-200 ${
                isExpanded
                  ? 'shadow-xl shadow-gray-300/40'
                  : 'shadow-md shadow-gray-300/25'
              }`}
            >
              <div
                className="flex items-start py-4 px-4 font-bold bg-neutral-50 text-neutral-600 cursor-pointer hover:bg-neutral-100 transition-colors"
                onClick={() => setExpandedChapters((prev: {[key: string]: boolean}) => ({
                  ...prev,
                  [chapter.chapter_uuid]: !isExpanded
                }))}
              >
                <div className="flex flex-col justify-center mr-3 pt-1">
                  <svg
                    className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <div className="flex flex-col items-start w-full">
                  <div className="flex items-center flex-wrap mb-1 w-full min-w-0">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 text-xs font-semibold mr-2 border border-neutral-300 flex-shrink-0">
                      {idx + 1}
                    </span>
                    <h3 className="text-lg font-bold leading-tight truncate min-w-0 sm:text-base md:text-lg" style={{ lineHeight: '1.2' }}>{chapter.name}</h3>
                  </div>
                  <div className="flex items-center space-x-1 text-sm text-neutral-400 font-normal">
                    <Layers size={16} className="mr-1" />
                    <span>{chapter.activities.length} {t('activities.activities')}</span>
                  </div>
                </div>
              </div>
              <div className={`transition-all duration-200 ${isExpanded ? 'block' : 'hidden'}`}>
                {chapter.activities.map((activity: any) => {
                  const done = !!isActivityDone(activity)
                  const isNextUp = activity.activity_uuid === nextActivity?.activity_uuid
                  return (
                    <Link
                      key={activity.activity_uuid}
                      href={getUriWithOrg(
                        orgslug,
                        routePaths.org.courseActivity(
                          courseuuid,
                          activity.activity_uuid.replace('activity_', '')
                        )
                      )}
                      rel="noopener noreferrer"
                      prefetch={false}
                      className={`block group transition-colors duration-150 px-4 py-3 ${
                        done
                          ? 'bg-neutral-100 hover:bg-neutral-150'
                          : isNextUp
                            ? 'bg-teal-50 hover:bg-teal-100'
                            : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex space-x-3 items-center">
                        <div className="shrink-0">
                          {done ? (
                            <div className="w-7 h-7 rounded-full bg-teal-200 flex items-center justify-center">
                              <Check size={13} strokeWidth={2.5} className="text-teal-600" />
                            </div>
                          ) : isNextUp ? (
                            <div className="w-7 h-7 rounded-full bg-teal-500 shadow-md shadow-teal-300/60 flex items-center justify-center">
                              <Play size={10} fill="white" className="text-white ml-0.5" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-full border-2 border-neutral-300" />
                          )}
                        </div>
                        <div className="flex flex-col grow min-w-0">
                          <div className="flex items-center space-x-2 w-full">
                            <p className={`font-semibold truncate transition-colors ${done ? 'text-neutral-400' : 'text-neutral-600 group-hover:text-neutral-800'}`}>{activity.name}</p>
                            {isActivityCurrent(activity) && (
                              <div className="flex items-center space-x-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 animate-pulse">
                                <span>{t('activities.current')}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 mt-0.5 text-neutral-400">
                            {activity.activity_type === 'TYPE_DYNAMIC' && <StickyNote size={10} />}
                            {activity.activity_type === 'TYPE_VIDEO' && <Video size={10} />}
                            {activity.activity_type === 'TYPE_DOCUMENT' && <File size={10} />}
                            {activity.activity_type === 'TYPE_ASSIGNMENT' && <Backpack size={10} />}
                            <span className="text-xs font-medium">{getActivityTypeLabel(activity.activity_type)}</span>
                          </div>
                        </div>
                        <div className="text-neutral-300 group-hover:text-neutral-400 transition-colors shrink-0">
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CourseClient
