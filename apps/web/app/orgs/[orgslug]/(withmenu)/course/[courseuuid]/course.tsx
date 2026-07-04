'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import React, { useEffect, useMemo, useState } from 'react'
import { getUriWithOrg, getAPIUrl, routePaths } from '@services/config/config'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { swrFetcher } from '@services/utils/ts/requests'
import ActivityIndicators from '@components/Pages/Courses/ActivityIndicators'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import {
  getCourseThumbnailMediaDirectory,
} from '@services/media/media'
import { learningPathToLegacyRun } from '@services/learning/legacyAdapters'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import { CourseThumbnailImage } from '@components/Objects/Thumbnails/CourseThumbnailImage'
import { ArrowRight, Award, BookOpenCheck, Check, CircleHelp, Clock, FileText, Layers, Play, Video, Image as ImageIcon } from 'lucide-react'
import { FeaturedBadgeButton } from '@components/Objects/Portfolio/ProfileAchievements'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import CourseShare from '@components/Objects/Courses/CourseShare/CourseShare'
import { useAnalytics } from '@/hooks/useAnalytics'
import {
  useContainerBreakpoints,
} from '@components/Contexts/ContainerBreakpointContext'
import ActivityCourseOutline from '@components/Pages/Activity/ActivityCourseOutline'
import { getChapterCompletionSummary, getCourseChapterCompletionSummary } from '@services/courses/progress'
import { useRouter } from 'next/navigation'
import { getMyQuizResult } from '@services/quiz/quiz'
import QuizResultsModal from '@components/Objects/Activities/Quiz/Player/QuizResultsModal'
import toast from 'react-hot-toast'
import { devCompleteCourse } from '@services/courses/activity'
import { useWindowSize } from 'usehooks-ts'
import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview'

const ReactConfetti = dynamic(() => import('react-confetti'), { ssr: false })

function getBadgeThumbnailSrc(course: any, ownerOrgUuid?: string) {
  if (course?.thumbnail_image_url) return course.thumbnail_image_url
  if (course?.thumbnail_image && ownerOrgUuid) {
    return getCourseThumbnailMediaDirectory(
      ownerOrgUuid,
      course.course_uuid,
      course.thumbnail_image
    )
  }
  return ''
}

function cleanCredentialBadgeUuid(value?: string | null) {
  return String(value || '').replace(/^badge_/, '')
}

function findAwardForBadge(awards: any, badgeUuid?: string | null) {
  const cleanBadgeUuid = cleanCredentialBadgeUuid(badgeUuid)
  const awardList = Array.isArray(awards) ? awards : awards?.data || []
  if (!cleanBadgeUuid) return null
  return awardList.find((item: any) => (
    cleanCredentialBadgeUuid(item?.badge?.badge_uuid) === cleanBadgeUuid ||
    cleanCredentialBadgeUuid(item?.award?.badge_uuid) === cleanBadgeUuid
  )) || null
}

const BadgeClient = ({ props, showPath }: { props: any; showPath: boolean }) => {
  const { t } = useTranslation()
  const router = useRouter()
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
  const { data: trailData, mutate: mutateTrailData } = useSWR(
    props.learningBadgePath ? null : courseOwnerOrgId ? `${getAPIUrl()}trail/org/${courseOwnerOrgId}/trail` : null,
    (url) => swrFetcher(url, access_token)
  );
  const learningRun = useMemo(() => learningPathToLegacyRun(props.learningBadgePath), [props.learningBadgePath])

  const activeError = serverError || courseError

  const run = useMemo(() => {
    if (learningRun) return learningRun
    const cleanCourseUuid = course?.course_uuid?.replace('course_', '')
    return trailData?.runs?.find((trailRun: any) => (
      trailRun.course?.course_uuid?.replace('course_', '') === cleanCourseUuid
    ))
  }, [course?.course_uuid, learningRun, trailData])
  const completion = useMemo(() => getCourseChapterCompletionSummary(course, run), [course, run])
  const { totalChapters, completedChapters, isCompleted, isStarted } = completion
  const badgeStatusPath = routePaths.org.badgeStatus(courseuuid)
  const badgePath = routePaths.org.badgePath(courseuuid)
  const cleanCourseBadgeUuid = cleanCredentialBadgeUuid(course?.course_uuid || courseuuid)

  const { data: userBadgeAwards, mutate: mutateUserBadgeAwards } = useSWR(
    props.learningBadgePath && access_token && org?.id
      ? `${getAPIUrl()}badge-awards/?org_id=${org.id}`
      : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  )
  const earnedBadgeAward = useMemo(
    () => findAwardForBadge(userBadgeAwards, cleanCourseBadgeUuid),
    [userBadgeAwards, cleanCourseBadgeUuid]
  )

  const { data: userCertificates, mutate: mutateUserCertificates } = useSWR(
    !props.learningBadgePath && access_token && org?.id && course?.course_uuid
      ? `${getAPIUrl()}certifications/user/course/${course.course_uuid}?org_id=${org.id}`
      : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  )
  const userCertificate = Array.isArray(userCertificates) ? userCertificates[0] : null
  const learningAward = earnedBadgeAward?.award || props.learningBadgePath?.run?.award
  const hasEarnedCredential = Boolean(learningAward || userCertificate)
  const badgeIsCompleted = isCompleted || hasEarnedCredential
  const badgeIsInProgress = isStarted && !badgeIsCompleted
  const awardedCredentialId = learningAward?.award_uuid || userCertificate?.certificate_user?.user_certification_uuid
  const verificationPath = awardedCredentialId
    ? routePaths.org.badgesVerify(awardedCredentialId)
    : null
  const verificationUrl = verificationPath
    ? getUriWithOrg(orgslug, verificationPath)
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
          <button
            type="button"
            onClick={() => router.back()}
            className="text-blue-600 hover:underline"
          >
            Back
          </button>
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
            <ContentPageHeader
              orgslug={orgslug}
            />

            {showPath ? (
              <BadgePathView
                course={course}
                courseOwnerOrgUuid={courseOwnerOrgUuid}
                orgslug={orgslug}
                run={run}
                badgeStatusPath={badgeStatusPath}
              />
            ) : (
              <BadgeStatusHero
                course={course}
                courseOwnerOrgUuid={courseOwnerOrgUuid}
                orgslug={orgslug}
                badgePath={badgePath}
                t={t}
                comingSoon={!!course.coming_soon}
                completedChapters={completedChapters}
                totalChapters={totalChapters}
                isInProgress={badgeIsInProgress}
                isCompleted={badgeIsCompleted}
                verificationUrl={verificationUrl}
                awardedDate={learningAward?.issued_at || userCertificate?.certificate_user?.created_at}
                accessToken={access_token}
                showDevComplete={process.env.NEXT_PUBLIC_LAUNCHLMS_DEVELOPMENT_MODE === 'true'}
                onDevComplete={async () => {
                  await mutateTrailData()
                  await mutateUserCertificates()
                  await mutateUserBadgeAwards()
                }}
                badgeId={awardedCredentialId}
                learningBadgePath={props.learningBadgePath}
                userCertificate={userCertificate}
                learningAward={earnedBadgeAward}
              />
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

function BadgePathView({ course, courseOwnerOrgUuid, orgslug, run, badgeStatusPath }: any) {
  const chapters = useMemo(
    () => course.chapters?.filter((chapter: any) => (chapter.activities || []).length > 0) || [],
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
  const chapterSummaries = useMemo(
    () => chapters.map((chapter: any) => getChapterCompletionSummary(chapter, run)),
    [chapters, run]
  )
  const nextChapterIndex = chapterSummaries.findIndex((summary: any) => !summary.isCompleted)
  const [activeIndex, setActiveIndex] = useState(nextChapterIndex >= 0 ? nextChapterIndex : 0)
  useEffect(() => {
    setActiveIndex(nextChapterIndex >= 0 ? nextChapterIndex : 0)
  }, [nextChapterIndex])
  const totalChapters = chapterSummaries.length
  const completedChapterCount = chapterSummaries.filter((summary: any) => summary.isCompleted).length
  const progressPercent = totalChapters > 0 ? (completedChapterCount / totalChapters) * 100 : 0
  const badgeHref = getUriWithOrg(orgslug, badgeStatusPath)

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2 lg:gap-14">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Link
          href={badgeHref}
          className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 shrink-0 overflow-visible rounded-lg bg-transparent">
              {getBadgeThumbnailSrc(course, courseOwnerOrgUuid) ? (
                <BadgeThumbnailImage
                  src={getBadgeThumbnailSrc(course, courseOwnerOrgUuid)}
                  alt={course.name}
                  className={`${
                    progressPercent >= 100 ? '' : 'opacity-55 grayscale brightness-110'
                  }`}
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
              <span className="tabular-nums">{completedChapterCount}/{totalChapters}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </Link>
      </aside>

      <div className="space-y-3">
        {chapters.map((chapter: any, index: number) => {
          const summary = chapterSummaries[index]
          const firstActivity = chapter.activities?.[0]
          const isCompletedChapter = summary?.isCompleted
          const isInProgressChapter = summary?.isStarted && !summary?.isCompleted
          const isNext = index === nextChapterIndex
          const isAvailable = isCompletedChapter || isInProgressChapter || isNext
          const isActive = index === activeIndex && isAvailable
          const Icon = getPathActivityIcon(firstActivity?.activity_type)
          const stateLabel = isCompletedChapter
            ? 'Complete'
            : isInProgressChapter
              ? 'In progress'
              : isNext
                ? 'Next up'
                : 'Locked'
          const chapterHref = getUriWithOrg(
            orgslug,
            routePaths.org.badgeChapter(
              course.course_uuid.replace('course_', ''),
              (chapter.chapter_uuid || chapter.id || '').toString().replace('chapter_', '')
            )
          )

          return (
            <div
              key={chapter.chapter_uuid || chapter.id || chapter.name || index}
              className={`rounded-lg bg-white transition-all ${
                isNext || isInProgressChapter
                  ? `border-2 border-green-500 ${isActive ? '-translate-y-1 shadow-lg' : 'shadow-sm'}`
                  : isCompletedChapter
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
                    {chapter.name}
                  </p>
                  <p className={`mt-0.5 text-xs font-medium ${
                    isNext || isInProgressChapter ? 'text-green-600' : isCompletedChapter ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    {stateLabel}
                  </p>
                </div>
              </button>

              {isActive && (
                <div className="space-y-3 px-4 pb-4 pl-[4.5rem]">
                  <Link
                    href={chapterHref}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      isNext || isInProgressChapter
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isCompletedChapter ? 'Review' : isInProgressChapter ? 'Continue' : 'Get started'}
                    <ArrowRight size={15} />
                  </Link>
                  <div className="space-y-2">
                    {(chapter.activities || [])
                      .filter((chapterActivity: any) => chapterActivity.activity_type === 'TYPE_QUIZ')
                      .map((quizActivity: any) => (
                        <PathQuizResultAction
                          key={quizActivity.activity_uuid || quizActivity.id}
                          activity={quizActivity}
                          course={course}
                          orgslug={orgslug}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PathQuizResultAction({ activity, course, orgslug }: { activity: any; course: any; orgslug: string }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const [result, setResult] = useState<any>(undefined)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    getMyQuizResult(activity.activity_uuid, accessToken)
      .then((nextResult) => {
        if (mounted) setResult(nextResult || null)
      })
      .catch(() => {
        if (mounted) setResult(null)
      })
    return () => { mounted = false }
  }, [activity.activity_uuid, accessToken])

  if (!result) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900"
      >
        View result for {activity.name || 'quiz'}
      </button>
      {open && (
        <QuizResultsModal
          result={result}
          activity={activity}
          org={org}
          course={course}
          onRetake={() => setOpen(false)}
          onClose={() => setOpen(false)}
          showRetakeButton={false}
        />
      )}
    </>
  )
}

function BadgeStatusHero({
  course,
  courseOwnerOrgUuid,
  orgslug,
  badgePath,
  t,
  comingSoon,
  completedChapters,
  totalChapters,
  isInProgress,
  isCompleted,
  verificationUrl,
  awardedDate,
  accessToken,
  showDevComplete,
  onDevComplete,
  badgeId,
  learningBadgePath,
  userCertificate,
  learningAward,
}: any) {
  const router = useRouter()
  const { width, height } = useWindowSize()
  const [isDevCompleting, setIsDevCompleting] = useState(false)
  const [showCompletionReward, setShowCompletionReward] = useState(false)
  const progressPercent = totalChapters > 0
    ? Math.round((completedChapters / totalChapters) * 100)
    : 0
  const badgeUuid = course.course_uuid?.replace('course_', '') || course.course_uuid
  const pathUrl = getUriWithOrg(orgslug, badgePath)
  const inviteUrl = getUriWithOrg(orgslug, routePaths.org.badgeInvite(badgeUuid))
  const earnedDateLabel = awardedDate
    ? new Date(awardedDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  const chapters = Array.isArray(course.chapters) ? course.chapters : []
  const canDevComplete = !learningBadgePath && showDevComplete && accessToken && !comingSoon && (!isCompleted || !verificationUrl)
  const completionRewardKey = `launchlms:badge-completion-reward:${badgeUuid}`
  const badgeMetadata = course.badge_metadata || {}
  const certificateConfig = userCertificate?.certification?.config || {}
  const awardBadgeClass = learningAward?.badge_class || {}
  const awardIssuer = learningAward?.issuer || learningAward?.open_badges?.issuer || {}
  const certificateName =
    awardBadgeClass.name ||
    certificateConfig.badge_name ||
    certificateConfig.certification_name ||
    badgeMetadata.badge_name ||
    course.name
  const certificateDescription =
    awardBadgeClass.description ||
    certificateConfig.badge_description ||
    certificateConfig.certification_description ||
    badgeMetadata.badge_description ||
    course.description ||
    course.about ||
    'This badge certifies completion of the required learning path.'
  const certificatePattern =
    certificateConfig.badge_theme ||
    certificateConfig.certificate_pattern ||
    badgeMetadata.badge_theme ||
    badgeMetadata.certificate_pattern ||
    'professional'
  const certificateType =
    certificateConfig.certification_type ||
    badgeMetadata.certification_type ||
    'completion'
  const certificateInstructor =
    awardIssuer.name ||
    userCertificate?.issuer?.name ||
    badgeMetadata.issuer_name ||
    course.owner_org_name ||
    ''
  const certificateBadgeImage =
    awardBadgeClass.image ||
    certificateConfig.badge_image_url ||
    badgeMetadata.badge_image_url ||
    getBadgeThumbnailSrc(course, courseOwnerOrgUuid)

  useEffect(() => {
    if (!isCompleted || !badgeUuid) {
      setShowCompletionReward(false)
      return
    }

    try {
      const hasSeenReward = window.localStorage.getItem(completionRewardKey) === '1'
      if (!hasSeenReward) {
        setShowCompletionReward(true)
        window.localStorage.setItem(completionRewardKey, '1')
      }
    } catch {
      setShowCompletionReward(true)
    }
  }, [badgeUuid, completionRewardKey, isCompleted])

  const handleDevComplete = async () => {
    if (!canDevComplete || isDevCompleting) return

    setIsDevCompleting(true)
    try {
      await devCompleteCourse(badgeUuid, accessToken)
      toast.success('Course completed')
      await onDevComplete?.()
      router.push(getUriWithOrg(orgslug, routePaths.org.badgeStatus(badgeUuid)))
    } catch (error: any) {
      toast.error(error?.message || 'Could not complete course')
    } finally {
      setIsDevCompleting(false)
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {showCompletionReward && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <ReactConfetti
            width={width}
            height={height}
            numberOfPieces={200}
            recycle={false}
            colors={['#6366f1', '#10b981', '#3b82f6']}
          />
        </div>
      )}
      <section className="text-center">
        <div className="flex justify-center px-8 pt-5 sm:pt-6">
          <div className="h-36 w-36 overflow-visible rounded-lg sm:h-40 sm:w-40">
            {getBadgeThumbnailSrc(course, courseOwnerOrgUuid) ? (
              <BadgeThumbnailImage
                src={getBadgeThumbnailSrc(course, courseOwnerOrgUuid)}
                alt={course.name}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-300">
                <Award size={64} strokeWidth={1.25} />
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-2xl">
          {showCompletionReward && (
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-green-600">
              Congratulations! 🎉 you have mastered
            </p>
          )}
          <h1 className="text-2xl font-semibold leading-tight text-gray-950 sm:text-3xl">
            {course.name}
          </h1>

          {isCompleted ? (
            earnedDateLabel && (
              <div className="mt-4 inline-flex items-center rounded-full bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-700 ring-1 ring-green-100">
                Earned {earnedDateLabel}
              </div>
            )
          ) : (
            (course.about || course.description) && (
              <p className="mx-auto mt-2 line-clamp-2 max-w-xl whitespace-pre-line text-sm leading-relaxed text-gray-500 sm:text-base">
                {course.about || course.description}
              </p>
            )
          )}
        </div>

        <div className="mt-4 flex justify-center">
          {comingSoon ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-orange-100 px-4 py-2.5 text-sm font-semibold text-orange-700">
              <Clock size={15} />
              {t('courses.coming_soon')}
            </span>
          ) : isCompleted ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <CourseShare
                courseName={course.name}
                courseUrl={inviteUrl}
                label="Share invite"
                shareText={`Claim an invite to earn the ${course.name} badge`}
              />
              {verificationUrl && (
                <Link
                  href={verificationUrl}
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 nice-shadow transition-colors hover:text-neutral-800"
                >
                  <FileText size={14} />
                  View certificate
                </Link>
              )}
              <FeaturedBadgeButton badgeId={badgeId} />
              {canDevComplete && (
                <button
                  type="button"
                  onClick={handleDevComplete}
                  disabled={isDevCompleting}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check size={15} />
                  {isDevCompleting ? 'Issuing...' : 'Dev issue badge'}
                </button>
              )}
            </div>
          ) : isInProgress ? (
            <div className="w-full max-w-md">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
                <span>Progress</span>
                <span className="tabular-nums">{completedChapters}/{totalChapters}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gray-800 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href={pathUrl}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Play size={15} fill="currentColor" />
                  Continue
                </Link>
                <CourseShare
                  courseName={course.name}
                  courseUrl={inviteUrl}
                  label="Share invite"
                  shareText={`Claim an invite to earn the ${course.name} badge`}
                />
                {canDevComplete && (
                  <button
                    type="button"
                    onClick={handleDevComplete}
                    disabled={isDevCompleting}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Check size={15} />
                    {isDevCompleting ? 'Completing...' : 'Dev complete'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href={pathUrl}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Play size={15} fill="currentColor" />
                {t('courses.get_started')}
              </Link>
              <CourseShare
                courseName={course.name}
                courseUrl={inviteUrl}
                label="Share invite"
                shareText={`Claim an invite to earn the ${course.name} badge`}
              />
              {canDevComplete && (
                <button
                  type="button"
                  onClick={handleDevComplete}
                  disabled={isDevCompleting}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check size={15} />
                  {isDevCompleting ? 'Completing...' : 'Dev complete'}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {isCompleted && badgeId && verificationUrl && (
        <section className="mt-6 space-y-4" aria-label="Certificate">
          <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Certificate</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Your verifiable Open Badge certificate is ready to share.
                </p>
              </div>
              <Link
                href={verificationUrl}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                <FileText size={15} />
                Open certificate
              </Link>
            </div>
            <CertificatePreview
              certificationName={certificateName}
              certificationDescription={certificateDescription}
              certificationType={certificateType}
              certificatePattern={certificatePattern}
              certificateInstructor={certificateInstructor}
              certificateId={badgeId}
              awardedDate={earnedDateLabel || undefined}
              qrCodeLink={verificationUrl}
              badgeImageUrl={certificateBadgeImage}
            />
          </div>
        </section>
      )}

      {chapters.length > 0 && (
        <section className="mt-5 space-y-3" aria-label="Badge content">
          {chapters.map((chapter: any, index: number) => {
            const firstActivity = chapter.activities?.[0]
            const ChapterIcon = getPathActivityIcon(firstActivity?.activity_type)

            return (
              <Link
                key={chapter.chapter_uuid || chapter.id || chapter.name || index}
                href={pathUrl}
                className="flex min-h-[112px] w-full items-center gap-4 rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
              >
                <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 sm:h-24 sm:w-24">
                  <ChapterIcon size={30} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-gray-400">
                    Chapter {index + 1}
                  </p>
                  <h2 className="mt-1 break-words text-xl font-semibold leading-snug text-gray-950">
                    {chapter.name}
                  </h2>
                </div>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}

// Kept temporarily while legacy course detail callers are migrated to the badge views.
// eslint-disable-next-line no-unused-vars
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

function CourseClient(props: any) {
  return <BadgeClient props={props} showPath={false} />
}

export function BadgePathClient(props: any) {
  return <BadgeClient props={props} showPath />
}
