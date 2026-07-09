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
  normalizeMediaUrl,
} from '@services/media/media'
import { learningPathToLegacyRun } from '@services/learning/legacyAdapters'
import { createLearningBadgeNotificationSignup, getLearningPath, startLearningRun } from '@services/learning/learning'
import { getEligibleIssuers } from '@services/learning/marketplace'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import { CourseThumbnailImage } from '@components/Objects/Thumbnails/CourseThumbnailImage'
import { ArrowRight, Award, Bell, BookOpenCheck, Check, CircleHelp, Clock, FileText, Layers, Loader2, Play, Video, Zap, Image as ImageIcon } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { SafeImage } from '@components/Objects/SafeImage'

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
  const { data: clientLearningBadgePath } = useSWR(
    props.learningBadgePath && access_token
      ? ['learning-path', courseuuid, access_token]
      : null,
    () => getLearningPath(courseuuid, access_token, true),
    {
      fallbackData: props.learningBadgePath,
      revalidateOnFocus: true,
      revalidateOnMount: true,
    }
  )
  const learningBadgePath = clientLearningBadgePath || props.learningBadgePath
  const learningRun = useMemo(() => learningPathToLegacyRun(learningBadgePath), [learningBadgePath])

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
    learningBadgePath && access_token && org?.id
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
  const learningAward = earnedBadgeAward?.award || learningBadgePath?.run?.award
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
          <h2 className="text-xl font-semibold text-muted-foreground mb-2">
            {t('course.accessDenied', 'Unable to access this course')}
          </h2>
          <p className="text-muted-foreground mb-4">
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
              compactBottomMargin={showPath}
            />

            {showPath ? (
              <BadgePathView
                course={course}
                courseOwnerOrgUuid={courseOwnerOrgUuid}
                orgslug={orgslug}
                run={run}
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
                learningBadgePath={learningBadgePath}
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

function BadgePathView({ course, courseOwnerOrgUuid, orgslug, run }: any) {
  const descriptionRef = React.useRef<HTMLParagraphElement>(null)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [descriptionCanExpand, setDescriptionCanExpand] = useState(false)
  const chapters = useMemo(
    () => course.chapters?.filter((chapter: any) => (chapter.activities || []).length > 0) || [],
    [course.chapters]
  )
  const chapterSummaries = useMemo(
    () => chapters.map((chapter: any) => getChapterCompletionSummary(chapter, run)),
    [chapters, run]
  )
  const nextChapterIndex = chapterSummaries.findIndex((summary: any) => !summary.isCompleted)
  const totalChapters = chapterSummaries.length
  const completedChapterCount = chapterSummaries.filter((summary: any) => summary.isCompleted).length
  const progressPercent = totalChapters > 0 ? Math.round((completedChapterCount / totalChapters) * 100) : 0
  const badgeMetadata = course.badge_metadata || {}
  const timeLabel = badgeMetadata.estimated_time_label || badgeMetadata.estimated_time || '~2 hrs'
  const heroSubtitle = course.description || course.about || 'Complete the activities in order to earn this badge.'
  const thumbnailSrc = getBadgeThumbnailSrc(course, courseOwnerOrgUuid)

  useEffect(() => {
    const element = descriptionRef.current
    if (!element || !heroSubtitle) {
      setDescriptionCanExpand(false)
      return
    }
    setDescriptionCanExpand(element.scrollHeight > element.clientHeight + 2)
  }, [descriptionExpanded, heroSubtitle])

  return (
    <section className="mx-auto w-full max-w-6xl pb-6">
      <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(180px,0.48fr)_minmax(320px,1fr)] lg:items-center lg:gap-8">
        <div className="flex h-[150px] items-center justify-center overflow-visible sm:h-[168px] lg:h-[184px]">
          <div className="relative h-full w-full max-w-[300px] overflow-visible">
            {thumbnailSrc ? (
              <BadgeThumbnailImage
                src={thumbnailSrc}
                alt={course.name}
                containerClassName="h-full w-full"
                imageClassName="h-full w-full object-contain p-[2%]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
                <Award size={64} strokeWidth={1.25} />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="max-w-[520px] pb-0.5 text-[24px] font-black leading-[1.08] tracking-normal text-foreground line-clamp-2 sm:text-[30px] lg:text-[36px]">
            {course.name}
          </h1>
          {heroSubtitle ? (
            <div className="mt-2 hidden max-w-xl sm:block">
              <p ref={descriptionRef} className={`whitespace-pre-line text-xs font-medium leading-5 text-muted-foreground sm:text-sm ${descriptionExpanded ? '' : 'line-clamp-2'}`}>
                {heroSubtitle}
              </p>
              {descriptionCanExpand || descriptionExpanded ? (
                <button type="button" onClick={() => setDescriptionExpanded((value) => !value)} className="mt-1 text-xs font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {descriptionExpanded ? 'Show less' : 'Read more'}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex max-w-xl items-center gap-4">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[var(--org-primary-color)] transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">{progressPercent}% complete</span>
          </div>

          <div className="mt-4 hidden flex-wrap gap-x-8 gap-y-3 sm:flex">
            <CompactPathStat icon={<Zap size={18} fill="currentColor" />} value={totalChapters || 0} label="Activities" />
            <CompactPathStat icon={<Clock size={18} />} value={timeLabel} label="Total time" />
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4 lg:mt-5 lg:pt-4">
        <h2 className="text-sm font-black uppercase tracking-normal text-foreground">Your Path</h2>
        <div className="relative mt-5 space-y-3">
          <div className="absolute bottom-5 left-5 top-5 w-px bg-border sm:left-[1.55rem]" />
          {chapters.map((chapter: any, index: number) => {
            const summary = chapterSummaries[index]
            const firstActivity = chapter.activities?.[0]
            const isCompletedChapter = summary?.isCompleted
            const isInProgressChapter = summary?.isStarted && !summary?.isCompleted
            const isNext = index === nextChapterIndex
            const isAvailable = isCompletedChapter || isInProgressChapter || isNext
            const Icon = getPathActivityIcon(firstActivity?.activity_type)
            const actionLabel = isCompletedChapter ? 'Review' : isInProgressChapter ? 'Continue' : 'Start'
            const coverSrc = getPathActivityCoverSrc(chapter, firstActivity, course, courseOwnerOrgUuid)
            const chapterHref = getUriWithOrg(
              orgslug,
              routePaths.org.badgeChapter(
                course.course_uuid.replace('course_', ''),
                (chapter.chapter_uuid || chapter.id || '').toString().replace('chapter_', '')
              )
            )
            const card = (
              <div
                className={cn(
                  'group grid min-h-[88px] grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border p-3 transition sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:p-4',
                  isNext || isInProgressChapter
                    ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)]/10 shadow-[0_0_0_1px_var(--org-primary-color)]'
                    : isCompletedChapter
                      ? 'border-border bg-muted/30'
                      : 'border-border bg-muted/40 opacity-70',
                  isAvailable && 'hover:-translate-y-0.5 hover:bg-muted/50'
                )}
              >
                <div className={cn(
                  'flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg sm:h-20 sm:w-20',
                  isAvailable ? 'bg-card text-[var(--org-primary-color)] ring-1 ring-border' : 'bg-card text-muted-foreground ring-1 ring-border'
                )}>
                  {coverSrc ? (
                    <SafeImage src={coverSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon size={30} strokeWidth={1.7} />
                  )}
                </div>

                <div className="min-w-0">
                  <h3 className={cn('text-base font-black leading-tight sm:text-lg', isAvailable ? 'text-foreground' : 'text-muted-foreground')}>
                    {chapter.name}
                  </h3>
                  {(chapter.description || firstActivity?.description) ? (
                    <p className="mt-1 hidden text-sm font-medium leading-5 text-muted-foreground sm:line-clamp-2">
                      {chapter.description || firstActivity?.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex sm:hidden">
                    {isAvailable ? (
                      <span className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-black transition',
                        isNext || isInProgressChapter
                          ? 'bg-[var(--org-primary-color)] text-white shadow-[0_3px_0_rgba(0,0,0,0.18)]'
                          : 'border border-border bg-card text-foreground'
                      )}>
                        {actionLabel}
                        <ArrowRight size={14} />
                      </span>
                    ) : (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <LockIcon />
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
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

                <div className="hidden justify-end sm:flex">
                  {isAvailable ? (
                    <span className={cn(
                      'inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-black transition',
                      isNext || isInProgressChapter
                        ? 'bg-[var(--org-primary-color)] text-white shadow-[0_4px_0_rgba(0,0,0,0.2)]'
                        : 'border border-border bg-card text-foreground'
                    )}>
                      {actionLabel}
                      <ArrowRight size={17} />
                    </span>
                  ) : (
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <LockIcon />
                    </span>
                  )}
                </div>
              </div>
            )

            return (
              <div key={chapter.chapter_uuid || chapter.id || chapter.name || index} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 sm:grid-cols-[3.25rem_minmax(0,1fr)]">
                <div className="relative z-10 flex justify-center pt-6">
                  <span className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2',
                    isCompletedChapter
                      ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white'
                      : isNext || isInProgressChapter
                        ? 'border-[var(--org-primary-color)] bg-card text-[var(--org-primary-color)] shadow-[0_0_18px_var(--org-primary-color)]'
                        : 'border-border bg-muted text-muted-foreground'
                  )}>
                    {isCompletedChapter ? <Check size={20} strokeWidth={2.8} /> : isAvailable ? <span className="h-3 w-3 rounded-full bg-[var(--org-primary-color)]" /> : <LockIcon />}
                  </span>
                </div>
                {isAvailable ? (
                  <Link href={chapterHref} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-primary-color)]">
                    {card}
                  </Link>
                ) : (
                  <div>{card}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function getPathActivityCoverSrc(chapter: any, activity: any, course: any, ownerOrgUuid?: string) {
  const rawCover = activity?.thumbnail_image || activity?.cover_image || chapter?.thumbnail_image || chapter?.cover_image
  if (!rawCover) return ''
  const normalized = normalizeMediaUrl(String(rawCover))
  if (/^(https?:|blob:|\/)/i.test(normalized)) return normalized
  if (!ownerOrgUuid || !course?.course_uuid) return normalized
  return getCourseThumbnailMediaDirectory(ownerOrgUuid, course.course_uuid, normalized)
}

function CompactPathStat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[var(--org-primary-color)]">{icon}</span>
        <span className="truncate text-sm font-black leading-tight text-foreground sm:text-base">{value}</span>
      </div>
      <div className="mt-1 pl-7 text-xs font-medium leading-tight text-muted-foreground">{label}</div>
    </div>
  )
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="10" x="5" y="11" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
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
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
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

function getOverviewCards(course: any) {
  const metadata = course.badge_metadata || {}
  return Array.isArray(metadata.overview_cards)
    ? metadata.overview_cards
        .map((card: any) => ({
          title: String(card?.title || '').trim(),
          body: String(card?.body || '').trim(),
          media_url: String(card?.media_url || '').trim(),
          image_side: card?.image_side === 'right' ? 'right' : 'left',
        }))
        .filter((card: any) => card.title || card.body || card.media_url)
    : []
}

function getFirstActivityHref(course: any, orgslug: string) {
  const badgeUuid = String(course.course_uuid || '').replace('course_', '')
  const firstChapter = (course.chapters || []).find((chapter: any) => (chapter.activities || []).length > 0)
  const chapterId = (firstChapter?.chapter_uuid || firstChapter?.id || '').toString().replace('chapter_', '')
  if (!badgeUuid || !chapterId) return getUriWithOrg(orgslug, routePaths.org.badgePath(badgeUuid))
  return getUriWithOrg(orgslug, routePaths.org.badgeChapter(badgeUuid, chapterId))
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
  const descriptionRef = React.useRef<HTMLParagraphElement>(null)
  const [isDevCompleting, setIsDevCompleting] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isNotifySaving, setIsNotifySaving] = useState(false)
  const [notifyRequested, setNotifyRequested] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [descriptionCanExpand, setDescriptionCanExpand] = useState(false)
  const [showCompletionReward, setShowCompletionReward] = useState(false)
  const [issuerOptions, setIssuerOptions] = useState<any[]>([])
  const [selectedIssuerId, setSelectedIssuerId] = useState<number | null>(null)
  const [issuerModalOpen, setIssuerModalOpen] = useState(false)
  const badgeUuid = course.course_uuid?.replace('course_', '') || course.course_uuid
  const pathUrl = getUriWithOrg(orgslug, badgePath)
  const firstActivityUrl = getFirstActivityHref(course, orgslug)
  const inviteUrl = getUriWithOrg(orgslug, routePaths.org.badgeInvite(badgeUuid))
  const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0
  const earnedDateLabel = awardedDate
    ? new Date(awardedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const canDevComplete = !learningBadgePath && showDevComplete && accessToken && !comingSoon && (!isCompleted || !verificationUrl)
  const completionRewardKey = `launchlms:badge-completion-reward:${badgeUuid}`
  const badgeMetadata = course.badge_metadata || {}
  const overviewCards = getOverviewCards(course)
  const heroSubtitle = badgeMetadata.overview_subtitle || course.description || course.about || ''
  const timeLabel = badgeMetadata.estimated_time_label || badgeMetadata.estimated_time || '~2 hrs'
  const trustLine = badgeMetadata.trust_line || '100% free - start anytime - no pressure'
  const certificateConfig = userCertificate?.certification?.config || {}
  const awardBadgeClass = learningAward?.badge_class || {}
  const awardIssuer = learningAward?.issuer || learningAward?.open_badges?.issuer || {}
  const certificateName = awardBadgeClass.name || certificateConfig.badge_name || certificateConfig.certification_name || badgeMetadata.badge_name || course.name
  const certificateDescription = awardBadgeClass.description || certificateConfig.badge_description || certificateConfig.certification_description || badgeMetadata.badge_description || course.description || course.about || 'This badge certifies completion of the required learning path.'
  const certificatePattern = certificateConfig.badge_theme || certificateConfig.certificate_pattern || badgeMetadata.badge_theme || badgeMetadata.certificate_pattern || 'professional'
  const certificateType = certificateConfig.certification_type || badgeMetadata.certification_type || 'completion'
  const certificateInstructor = awardIssuer.name || userCertificate?.issuer?.name || badgeMetadata.issuer_name || course.owner_org_name || ''
  const certificateBadgeImage = awardBadgeClass.image || certificateConfig.badge_image_url || badgeMetadata.badge_image_url || getBadgeThumbnailSrc(course, courseOwnerOrgUuid)

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

  useEffect(() => {
    const element = descriptionRef.current
    if (!element || !heroSubtitle) {
      setDescriptionCanExpand(false)
      return
    }
    setDescriptionCanExpand(element.scrollHeight > element.clientHeight + 2)
  }, [descriptionExpanded, heroSubtitle])

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

  const startBadge = async (issuingOrgId?: number) => {
    setIsStarting(true)
    try {
      await startLearningRun(badgeUuid, accessToken, issuingOrgId)
      router.push(firstActivityUrl)
    } catch (error: any) {
      toast.error(error?.message || 'Could not start badge')
    } finally {
      setIsStarting(false)
    }
  }

  const handlePrimaryAction = async () => {
    if (comingSoon || isStarting) return
    if (isInProgress) {
      router.push(pathUrl)
      return
    }
    // Badges can be issued by multiple orgs; let signed-in learners pick who supports them
    if (learningBadgePath && accessToken) {
      try {
        const response = await getEligibleIssuers(badgeUuid, accessToken)
        const issuers = response?.success ? response.data : response
        if (Array.isArray(issuers) && issuers.length > 1) {
          setIssuerOptions(issuers)
          setSelectedIssuerId(issuers[0]?.org?.id ?? null)
          setIssuerModalOpen(true)
          return
        }
      } catch {
        // Fall through and start under the badge's own org
      }
    }
    await startBadge()
  }

  const handleNotifyMe = async () => {
    if (isNotifySaving) return
    if (!accessToken) {
      toast.error('Sign in to get notified when this badge opens.')
      return
    }
    setIsNotifySaving(true)
    try {
      await createLearningBadgeNotificationSignup(badgeUuid, accessToken)
      setNotifyRequested(true)
      toast.success("We'll notify you when this badge opens.")
    } catch (error: any) {
      toast.error(error?.message || 'Could not save notification request')
    } finally {
      setIsNotifySaving(false)
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl pb-10">
      {showCompletionReward && (
        <div className="pointer-events-none fixed inset-0 z-50">
          <ReactConfetti width={width} height={height} numberOfPieces={200} recycle={false} colors={['#84cc16', '#7c3aed', '#111827']} />
        </div>
      )}

      <Modal
        isDialogOpen={issuerModalOpen}
        onOpenChange={setIssuerModalOpen}
        minHeight="no-min"
        minWidth="md"
        dialogTitle="Who will support you on this badge?"
        dialogDescription="This organization will review your submissions and issue your badge."
        dialogContent={
          <div className="flex flex-col gap-3 p-2">
            {issuerOptions.map((option: any) => (
              <button
                key={option.org?.id}
                type="button"
                onClick={() => setSelectedIssuerId(option.org?.id ?? null)}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${selectedIssuerId === option.org?.id ? 'border-black bg-muted' : 'border-border hover:bg-muted/50'}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{option.org?.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.is_creator ? 'Badge creator' : option.via_link ? 'Invited you to this badge' : 'Open to all learners'}
                  </p>
                </div>
                {selectedIssuerId === option.org?.id ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setIssuerModalOpen(false)
                void startBadge(selectedIssuerId ?? undefined)
              }}
              disabled={isStarting || selectedIssuerId === null}
              className="ml-auto mt-2 inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {isStarting && <Loader2 className="h-4 w-4 animate-spin" />}
              Start badge
            </button>
          </div>
        }
      />

      <section className="grid gap-8 pt-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(320px,1fr)] lg:items-center lg:gap-12">
        <div className="flex min-h-[220px] items-center justify-center overflow-visible px-4 py-6 sm:min-h-[280px]">
          <div className="relative h-48 w-48 overflow-visible sm:h-60 sm:w-60 lg:h-72 lg:w-72">
            {getBadgeThumbnailSrc(course, courseOwnerOrgUuid) ? (
              <BadgeThumbnailImage src={getBadgeThumbnailSrc(course, courseOwnerOrgUuid)} alt={course.name} />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
                <Award size={64} strokeWidth={1.25} />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {showCompletionReward && <p className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-green-600">Congratulations, you earned</p>}
          <h1 className="max-w-[560px] text-[36px] font-black leading-[0.95] tracking-normal text-foreground line-clamp-3 sm:text-[48px] lg:text-[56px]">{course.name}</h1>
          {isCompleted && earnedDateLabel ? (
            <div className="mt-5 inline-flex items-center rounded-full bg-green-50 px-3 py-1.5 text-sm font-bold text-green-700 ring-1 ring-green-100">Earned {earnedDateLabel}</div>
          ) : null}
          {heroSubtitle ? (
            <div className="mt-5 max-w-xl">
              <p ref={descriptionRef} className={`whitespace-pre-line text-base font-medium leading-7 text-muted-foreground ${descriptionExpanded ? '' : 'line-clamp-3'}`}>{heroSubtitle}</p>
              {descriptionCanExpand || descriptionExpanded ? (
                <button type="button" onClick={() => setDescriptionExpanded((value) => !value)} className="mt-2 text-sm font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {descriptionExpanded ? 'Show less' : 'Read more'}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-7 grid max-w-md grid-cols-2 divide-x divide-border border-y border-border py-5">
            <div className="px-3 first:pl-0">
              <Zap className="mb-2 h-7 w-7 text-purple-600" fill="currentColor" />
              <div className="text-xl font-black text-foreground">{totalChapters || 0}</div>
              <div className="mt-1 text-[11px] font-bold uppercase text-muted-foreground">Activities</div>
            </div>
            <div className="px-4">
              <Clock className="mb-2 h-7 w-7 text-purple-600" />
              <div className="text-xl font-black text-foreground">{timeLabel}</div>
              <div className="mt-1 text-[11px] font-bold uppercase text-muted-foreground">To complete</div>
            </div>
          </div>

          {isInProgress && !isCompleted ? (
            <div className="mt-5 max-w-xl">
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span>Progress</span>
                <span className="tabular-nums">{completedChapters}/{totalChapters}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:max-w-xl">
            {comingSoon ? (
              <>
                <button
                  type="button"
                  onClick={handleNotifyMe}
                  disabled={isNotifySaving}
                  className="inline-flex h-16 w-full items-center justify-center gap-3 rounded-lg bg-orange-100 px-6 text-lg font-black text-orange-800 shadow-sm transition hover:bg-orange-200 disabled:cursor-wait disabled:opacity-70"
                >
                  {isNotifySaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bell size={20} />}
                  {notifyRequested ? 'Notification set' : 'Notify me'}
                </button>
                <p className="text-center text-sm font-semibold text-muted-foreground">We'll let you know when this badge opens.</p>
              </>
            ) : isCompleted ? (
              <div className="flex flex-wrap items-center gap-2">
                <CourseShare courseName={course.name} courseUrl={inviteUrl} label="Share invite" shareText={`Claim an invite to earn the ${course.name} badge`} />
                {verificationUrl && (
                  <Link href={verificationUrl} className="inline-flex h-11 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-bold text-white transition-colors hover:bg-gray-800">
                    <FileText size={15} />
                    View certificate
                  </Link>
                )}
                <FeaturedBadgeButton badgeId={badgeId} />
              </div>
            ) : (
              <button type="button" onClick={handlePrimaryAction} disabled={isStarting} className="inline-flex h-16 w-full items-center justify-center gap-3 rounded-lg bg-lime-300 px-6 text-lg font-black text-black shadow-sm transition hover:bg-lime-200 disabled:cursor-wait disabled:opacity-70">
                {isStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play size={20} fill="currentColor" />}
                {isInProgress ? 'Continue' : "Let's do it"}
                <ArrowRight size={22} />
              </button>
            )}

            {!isCompleted && <div className="text-center text-xs font-bold uppercase text-muted-foreground">{trustLine}</div>}

            {canDevComplete && (
              <button type="button" onClick={handleDevComplete} disabled={isDevCompleting} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60">
                <Check size={15} />
                {isDevCompleting ? 'Completing...' : 'Dev complete'}
              </button>
            )}
          </div>
        </div>
      </section>

      {overviewCards.length > 0 && (
        <section className="mt-10 space-y-4" aria-label="About this badge">
          {overviewCards.map((card: any, index: number) => (
            <article
              key={`${card.title}-${index}`}
              className={`grid gap-5 rounded-lg bg-purple-50/70 p-5 ring-1 ring-purple-100 sm:items-center sm:p-6 lg:gap-10 ${
                card.image_side === 'right'
                  ? 'sm:grid-cols-[minmax(0,1fr)_180px] lg:grid-cols-[minmax(0,1fr)_200px]'
                  : 'sm:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)]'
              }`}
            >
              <div className={`flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-card text-purple-600 shadow-sm ${card.image_side === 'right' ? 'sm:order-2' : ''}`}>
                {card.media_url ? <img src={card.media_url} alt="" className="h-full w-full object-cover" /> : <Play size={44} fill="currentColor" />}
              </div>
              <div className={`flex min-w-0 ${card.image_side === 'right' ? 'sm:order-1' : ''}`}>
                <div className="w-3/4 min-w-0 text-left">
                  {card.title ? <h2 className="text-2xl font-black leading-tight text-purple-700 sm:text-3xl">{card.title}</h2> : null}
                  {card.body ? <p className="mt-3 whitespace-pre-line text-base font-medium leading-7 text-foreground">{card.body}</p> : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {isCompleted && badgeId && verificationUrl && (
        <section className="mt-8 space-y-4" aria-label="Certificate">
          <div className="rounded-lg bg-card p-4 shadow-sm ring-1 ring-border sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Certificate</h2>
                <p className="mt-1 text-sm text-muted-foreground">Your verifiable Open Badge certificate is ready to share.</p>
              </div>
              <Link href={verificationUrl} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800">
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
                              ? 'bg-card/90 text-foreground shadow-sm'
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
                              ? 'bg-card/90 text-foreground shadow-sm'
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
                              ? 'bg-card/90 text-foreground shadow-sm'
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
                              ? 'bg-card/90 text-foreground shadow-sm'
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
                className="mt-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {descriptionExpanded ? t('common.show_less') : t('common.show_more')}
              </button>
            )}
          </div>
        </div>

        {learnings.length > 0 && learnings[0]?.text !== 'null' && (
          <div className="w-full">
            <h2 className="py-5 text-xl font-bold">{t('courses.what_you_will_learn')}</h2>
            <div className="bg-card shadow-md shadow-gray-300/25 outline outline-1 outline-border/40 rounded-lg overflow-hidden px-5 py-5 space-y-2">
              {learnings.map((learning: any) => {
                const learningText = typeof learning === 'string' ? learning : learning.text
                const learningEmoji = typeof learning === 'string' ? null : learning.emoji
                const learningId = typeof learning === 'string' ? learning : learning.id || learning.text
                if (!learningText) return null
                return (
                  <div
                    key={learningId}
                    className="flex space-x-2 items-center font-semibold text-muted-foreground"
                  >
                    <div className="px-2 py-2 rounded-full">
                      {learningEmoji ? (
                        <span>{learningEmoji}</span>
                      ) : (
                        <Check className="text-muted-foreground" size={15} />
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
