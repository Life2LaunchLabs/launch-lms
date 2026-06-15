'use client'
import Link from 'next/link'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { AlertTriangle, Award, BookOpenCheck, CheckCircle, ChevronLeft, ChevronRight, UserRoundPen, Minimize2 } from 'lucide-react'
import { markActivityAsComplete, startCourse } from '@services/courses/activity'
import { getActivityWithAuthHeader } from '@services/courses/activities'
import {
  findChapterForActivity,
  findCourseRun,
  expandChapterPages,
  getChapterCompletionSummary,
  getCompletedCourseStepCount,
  isCourseActivityCompleted,
  type ChapterPageLike,
} from '@services/courses/progress'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import AuthenticatedClientElement from '@components/Security/AuthenticatedClientElement'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { useOrg, useOrgMembership } from '@components/Contexts/OrgContext'
import { CourseProvider } from '@components/Contexts/CourseContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import React, { useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { getAssignmentFromActivityUUID, getFinalGrade, submitAssignmentForGrading } from '@services/courses/assignments'
import { AssignmentProvider } from '@components/Contexts/Assignments/AssignmentContext'
import { AssignmentsTaskProvider } from '@components/Contexts/Assignments/AssignmentsTaskContext'
import AssignmentSubmissionProvider, { useAssignmentSubmission } from '@components/Contexts/Assignments/AssignmentSubmissionContext'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import useSWR from 'swr'
import { swrFetcher } from '@services/utils/ts/requests'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import PaidCourseActivityDisclaimer from '@components/Objects/Courses/CourseActions/PaidCourseActivityDisclaimer'
import ActivityShareDropdown from '@components/Pages/Activity/ActivityShareDropdown'
import ActivityChapterDropdown from '@components/Pages/Activity/ActivityChapterDropdown'
import CourseEndView from '@components/Pages/Activity/CourseEndView'
import { motion, AnimatePresence } from 'motion/react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { useTranslation } from 'react-i18next'
import { useAnalytics } from '@/hooks/useAnalytics'
import { defaultChapterIconName, getChannelIcon } from '@components/Resources/ResourceChannelStyle'
import QuizActivityPlayer, { type QuizPlayerHandle, type QuizPlayerState } from '@components/Objects/Activities/Quiz/Player/QuizActivityPlayer'

// Lazy load heavy components
const Canva = lazy(() => import('@components/Objects/Activities/DynamicCanva/DynamicCanva'))
const VideoActivity = lazy(() => import('@components/Objects/Activities/Video/Video'))
const DocumentPdfActivity = lazy(() => import('@components/Objects/Activities/DocumentPdf/DocumentPdf'))
const AssignmentStudentActivity = lazy(() => import('@components/Objects/Activities/Assignment/AssignmentStudentActivity'))
const AISidePanelContentWrapper = lazy(() => import('@components/Objects/Activities/AI/AIActivityAsk').then(mod => ({ default: mod.AISidePanelContentWrapper })))
const AISidePanelInline = lazy(() => import('@components/Objects/Activities/AI/AIActivityAsk').then(mod => ({ default: mod.AISidePanelInline })))
const AIChatBotProvider = lazy(() => import('@components/Contexts/AI/AIChatBotContext'))

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="relative w-6 h-6">
      <div className="absolute top-0 left-0 w-full h-full border-2 border-gray-100 rounded-full"></div>
      <div className="absolute top-0 left-0 w-full h-full border-2 border-gray-400 rounded-full animate-spin border-t-transparent"></div>
    </div>
  </div>
);

const ScormDisabledActivity = () => (
  <div className="flex items-center justify-center min-h-[24rem] p-6">
    <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <AlertTriangle className="h-6 w-6 text-amber-600" />
      </div>
      <h2 className="text-lg font-semibold text-amber-950">SCORM is disabled</h2>
      <p className="mt-2 text-sm text-amber-900">
        SCORM playback is intentionally disabled in core for now and will need a future native rebuild.
      </p>
    </div>
  </div>
)

interface ActivityClientProps {
  activityid: string
  courseuuid: string
  orgslug: string
  activity: any
  course: any
  guestMode?: boolean
  unauthenticated?: boolean
  guestCompletedHint?: boolean
  quickstartMode?: boolean
  chapterid?: string
}

interface ActivityActionsProps {
  activity: any
  activityid: string
  course: any
  orgslug: string
  assignment: any
  showNavigation?: boolean
  guestMode?: boolean
  publicGuestMode?: boolean
  quickstartMode?: boolean
}

// Custom hook for activity position
function useActivityPosition(course: any, activityId: string) {
  return useMemo(() => {
    let allActivities: any[] = [];
    let currentIndex = -1;
    
    course.chapters.forEach((chapter: any) => {
      chapter.activities.forEach((activity: any) => {
        const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...activity,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name,
          chapterId: chapter.id,
          chapterUuid: chapter.chapter_uuid
        });
        
        if (cleanActivityUuid === activityId.replace('activity_', '')) {
          currentIndex = allActivities.length - 1;
        }
      });
    });
    
    return { allActivities, currentIndex };
  }, [course, activityId]);
}

function getCleanActivityUuid(activityLike: any): string {
  return String(activityLike?.cleanUuid || activityLike?.activity_uuid || activityLike || '').replace('activity_', '')
}

function ActivityActions({ activity, activityid, course, orgslug, assignment, showNavigation = true, guestMode = false, publicGuestMode = false, quickstartMode = false }: ActivityActionsProps) {
  const isGuestLearner = guestMode || publicGuestMode
  return (
    <div className="flex min-w-0 items-stretch justify-end gap-2">
      {activity && activity.published == true && activity.content.paid_access != false && (
        isGuestLearner ? (
          <>
            {showNavigation && (
              <NextActivityButton course={course} currentActivityId={activity.id} activity={activity} orgslug={orgslug} guestMode={guestMode} publicGuestMode={publicGuestMode} quickstartMode={quickstartMode} />
            )}
          </>
        ) : (
          <AuthenticatedClientElement checkMethod="authentication">
            {activity.activity_type == 'TYPE_ASSIGNMENT' && (
              <AssignmentSubmissionProvider assignment_uuid={assignment?.assignment_uuid}>
                <AssignmentTools
                  assignment={assignment}
                  activity={activity}
                  activityid={activityid}
                  course={course}
                  orgslug={orgslug}
                />
              </AssignmentSubmissionProvider>
            )}
            {showNavigation && (
              <NextActivityButton course={course} currentActivityId={activity.id} activity={activity} orgslug={orgslug} quickstartMode={quickstartMode} />
            )}
          </AuthenticatedClientElement>
        )
      )}
    </div>
  );
}

function ActivityClient(props: ActivityClientProps) {
  const { t } = useTranslation()
  const initialActivityId = props.activityid
  const [activeActivityId, setActiveActivityId] = React.useState(initialActivityId)
  const [activeActivity, setActiveActivity] = React.useState(props.activity)
  const [activeActivityPageIndex, setActiveActivityPageIndex] = React.useState(0)
  const [activityTransitionDirection, setActivityTransitionDirection] = React.useState<'next' | 'prev'>('next')
  const [chapterRewardVisible, setChapterRewardVisible] = React.useState(false)
  const activityCacheRef = useRef<Map<string, any>>(new Map())
  const activityid = activeActivityId
  const isCourseEnd = activityid === 'end'
  const guestMode = props.guestMode === true
  const unauthenticated = props.unauthenticated === true
  const guestCompletedHint = props.guestCompletedHint === true
  const quickstartMode = props.quickstartMode === true
  const chapterRouteMode = Boolean(props.chapterid)
  const publicGuestMode = unauthenticated && !guestMode
  const isGuestLearner = guestMode || publicGuestMode

  function getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
  
    if (years > 0) return t('time.years_ago', { count: years });
    if (months > 0) return t('time.months_ago', { count: months });
    if (weeks > 0) return t('time.weeks_ago', { count: weeks });
    if (days > 0) return t('time.days_ago', { count: days });
    if (hours > 0) return t('time.hours_ago', { count: hours });
    if (minutes > 0) return t('time.minutes_ago', { count: minutes });
    return t('common.just_now');
  }

  const courseuuid = props.courseuuid
  const orgslug = props.orgslug
  const activity = activeActivity
  const course = props.course
  const org = useOrg() as any
  const { isUserPartOfTheOrg } = useOrgMembership()
  const session = useLHSession() as any;
  const pathname = usePathname()
  const access_token = session?.data?.tokens?.access_token;
  const [bgColor, setBgColor] = React.useState('bg-white')
  const [assignment, setAssignment] = React.useState(null) as any;
  const [isFocusMode, setIsFocusMode] = React.useState(false);
  const isInitialRender = useRef(true);
  const hasAttemptedGuestCourseStart = useRef(false)
  const hasAttemptedCourseStart = useRef(false)
  const quizPlayerRef = useRef<QuizPlayerHandle | null>(null)
  const [quizState, setQuizState] = React.useState<QuizPlayerState | null>(null)
  const router = useRouter();
  const searchParams = useSearchParams();

  const { track } = useAnalytics()
  const activityStartTime = useRef(Date.now())

  useEffect(() => {
    const cleanActivityId = getCleanActivityUuid(props.activity || initialActivityId)
    activityCacheRef.current.set(cleanActivityId, props.activity)
    setActiveActivity(props.activity)
    setActiveActivityId(initialActivityId)
    setActiveActivityPageIndex(0)
    setQuizState(null)
    setChapterRewardVisible(false)
  }, [initialActivityId, props.activity])

  // Track activity view on mount, time_on_activity on unmount
  const activityUuidForTracking = activity?.activity_uuid
  const courseUuidForTracking = course?.course_uuid
  const activityTypeForTracking = activity?.activity_type
  useEffect(() => {
    if (activityUuidForTracking && courseUuidForTracking) {
      activityStartTime.current = Date.now()
      track('activity_view', {
        activity_uuid: activityUuidForTracking,
        course_uuid: courseUuidForTracking,
        activity_type: activityTypeForTracking,
      })
    }
    return () => {
      if (activityUuidForTracking && courseUuidForTracking) {
        const seconds = Math.round((Date.now() - activityStartTime.current) / 1000)
        if (seconds > 0) {
          track('time_on_activity', {
            activity_uuid: activityUuidForTracking,
            course_uuid: courseUuidForTracking,
            seconds_spent: seconds,
          })
        }
      }
    }
  }, [activityid, activityUuidForTracking, courseUuidForTracking, activityTypeForTracking, track])

  const { data: trailData, error: error } = useSWR(
    isGuestLearner
      ? (org?.id ? `${getAPIUrl()}trail/org/${org?.id}/trail` : null)
      : (!org?.id || !access_token ? null : `${getAPIUrl()}trail/org/${org?.id}/trail`),
    (url) => swrFetcher(url, access_token)
  )
  const effectiveTrailData = trailData
  const courseRun = useMemo(
    () => findCourseRun(effectiveTrailData, course),
    [effectiveTrailData, course]
  )
  const totalCourseActivities =
    course.chapters?.reduce((acc: number, chapter: any) => acc + chapter.activities.length, 0) || 0
  const completedCourseActivities = getCompletedCourseStepCount(courseRun)
  const progressRatio =
    totalCourseActivities > 0 ? completedCourseActivities / totalCourseActivities : 0
  const currentChapter = useMemo(
    () => findChapterForActivity(course, activity?.id || activityid),
    [course, activity?.id, activityid]
  )
  const currentChapterSummary = useMemo(
    () => getChapterCompletionSummary(currentChapter, courseRun),
    [currentChapter, courseRun]
  )
  const isCurrentActivityCompleted = isCourseActivityCompleted(courseRun, activity?.id)
  const chapterCompletedActivities = currentChapterSummary.completedActivities + (
    activity?.id && !isCurrentActivityCompleted && (searchParams.get('chapter_complete') || chapterRewardVisible)
      ? 1
      : 0
  )
  const totalChapterActivities = currentChapterSummary.totalActivities || totalCourseActivities
  const chapterProgressRatio =
    totalChapterActivities > 0
      ? Math.min(1, chapterCompletedActivities / totalChapterActivities)
      : progressRatio
  const chapterPageList = useMemo(() => expandChapterPages(currentChapter), [currentChapter])
  const currentChapterPageIndex = useMemo(() => {
    if (!activity?.id) return 0
    const index = chapterPageList.findIndex((page) =>
      page.activity.id === activity.id && page.pageIndex === activeActivityPageIndex
    )
    return index >= 0 ? index : 0
  }, [chapterPageList, activity?.id, activeActivityPageIndex])
  const currentChapterPage = chapterPageList[currentChapterPageIndex] || null
  const previousChapterPage = currentChapterPageIndex > 0 ? chapterPageList[currentChapterPageIndex - 1] : null
  const nextChapterPage = currentChapterPageIndex < chapterPageList.length - 1 ? chapterPageList[currentChapterPageIndex + 1] : null
  const chapterPageTotal = chapterPageList.length || totalChapterActivities || 1
  const chapterPageCompleted = Math.min(chapterPageTotal, currentChapterPageIndex)
  const visibleChapterProgressLabel = `${chapterPageCompleted}/${chapterPageTotal}`
  const visibleChapterProgressValue = (chapterPageCompleted / chapterPageTotal) * 100
  const showChapterCompleteReward =
    !quickstartMode &&
    (Boolean(searchParams.get('chapter_complete')) || chapterRewardVisible) &&
    Boolean(currentChapter)
  const closeChapterReward = () => {
    const cleanCourseUuid = course.course_uuid?.replace('course_', '') || courseuuid
    router.push(getUriWithOrg(orgslug, routePaths.org.badgePath(cleanCourseUuid)))
  }
  const closeActivityViewer = React.useCallback(() => {
    const cleanCourseUuid = course.course_uuid?.replace('course_', '') || courseuuid
    const closePath = quickstartMode
      ? routePaths.org.quickstartCourse(cleanCourseUuid)
      : routePaths.org.badgePath(cleanCourseUuid)
    router.push(getUriWithOrg(orgslug, closePath))
  }, [course.course_uuid, courseuuid, orgslug, quickstartMode, router])

  const handleQuizComplete = React.useCallback(async (result: any) => {
    const passed = result?.result_json?.graded_result
      ? Boolean(result.result_json.graded_result.passed)
      : true
    if (!passed || !activity?.activity_uuid) return
    try {
      await markActivityAsComplete(
        orgslug,
        course.course_uuid,
        activity.activity_uuid,
        access_token
      )
      await mutate(`${getAPIUrl()}trail/org/${org?.id}/trail`)
    } catch (_) {}
  }, [activity?.activity_uuid, course.course_uuid, orgslug, access_token, org?.id])

  useEffect(() => {
    if (!isGuestLearner || !org?.id || !course?.course_uuid) return
    if (hasAttemptedGuestCourseStart.current) return
    hasAttemptedGuestCourseStart.current = true

    startCourse(course.course_uuid, orgslug, access_token)
      .then(() => mutate(`${getAPIUrl()}trail/org/${org?.id}/trail`))
      .catch(() => {})
  }, [isGuestLearner, org?.id, course?.course_uuid, orgslug, access_token])

  useEffect(() => {
    if (isGuestLearner || !session.data?.user || !isUserPartOfTheOrg || !org?.id || !course?.course_uuid) return
    if (hasAttemptedCourseStart.current) return
    hasAttemptedCourseStart.current = true

    startCourse(course.course_uuid, orgslug, access_token)
      .then(() => mutate(`${getAPIUrl()}trail/org/${org?.id}/trail`))
      .catch(() => {})
  }, [isGuestLearner, session.data?.user, isUserPartOfTheOrg, org?.id, course?.course_uuid, orgslug, access_token])

  // Memoize activity position calculation
  const { allActivities, currentIndex } = useActivityPosition(course, activityid);
  const coursePath = chapterRouteMode
    ? routePaths.org.badgePath(courseuuid)
    : quickstartMode
    ? routePaths.org.quickstartCourse(courseuuid)
    : routePaths.org.course(courseuuid)
  const buildActivityPath = (activityUuid: string) =>
    quickstartMode
      ? routePaths.org.quickstartCourseActivity(courseuuid, activityUuid)
      : routePaths.org.courseActivity(courseuuid, activityUuid)

  const setBrowserActivityUrl = React.useCallback((cleanActivityUuid: string) => {
    if (typeof window === 'undefined') return
    if (chapterRouteMode) return
    const nextPath = getUriWithOrg(orgslug, buildActivityPath(cleanActivityUuid))
    window.history.pushState(null, '', nextPath)
  }, [chapterRouteMode, orgslug, buildActivityPath])

  const loadActivityPayload = React.useCallback(async (activityLike: any) => {
    const cleanActivityUuid = getCleanActivityUuid(activityLike)
    if (!cleanActivityUuid) return null

    const cached = activityCacheRef.current.get(cleanActivityUuid)
    if (cached) return cached

    const payload = await getActivityWithAuthHeader(cleanActivityUuid, null, access_token || null)
    activityCacheRef.current.set(cleanActivityUuid, payload)
    return payload
  }, [access_token])

  const activateChapterActivity = React.useCallback(async (activityLike: any, direction: 'next' | 'prev' = 'next', pageIndex = 0) => {
    const cleanActivityUuid = getCleanActivityUuid(activityLike)
    if (!cleanActivityUuid) return

    try {
      const payload = await loadActivityPayload(activityLike)
      if (!payload) return

      setActivityTransitionDirection(direction)
      setQuizState(null)
      setAssignment(null)
      setChapterRewardVisible(false)
      setActiveActivity(payload)
      setActiveActivityId(cleanActivityUuid)
      setActiveActivityPageIndex(pageIndex)
      setBrowserActivityUrl(cleanActivityUuid)
    } catch (_) {
      router.push(getUriWithOrg(orgslug, buildActivityPath(cleanActivityUuid)))
    }
  }, [buildActivityPath, loadActivityPayload, orgslug, router, setBrowserActivityUrl])

  useEffect(() => {
    if (!currentChapter?.activities?.length) return
    const chapterActivities = currentChapter.activities
    const browserWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }

    const cleanCourseUuid = course.course_uuid?.replace('course_', '') || courseuuid
    const routesToPrefetch = [
      getUriWithOrg(
        orgslug,
        quickstartMode
          ? routePaths.org.quickstartCourse(cleanCourseUuid)
          : routePaths.org.badgePath(cleanCourseUuid)
      ),
    ]

    chapterActivities.forEach((chapterActivity: any) => {
      void loadActivityPayload(chapterActivity).catch(() => {})
    })

    const chapterActivityTypes = new Set(chapterActivities.map((chapterActivity: any) => chapterActivity.activity_type))
    if (chapterActivityTypes.has('TYPE_DYNAMIC')) void import('@components/Objects/Activities/DynamicCanva/DynamicCanva')
    if (chapterActivityTypes.has('TYPE_VIDEO')) void import('@components/Objects/Activities/Video/Video')
    if (chapterActivityTypes.has('TYPE_DOCUMENT')) void import('@components/Objects/Activities/DocumentPdf/DocumentPdf')
    if (chapterActivityTypes.has('TYPE_ASSIGNMENT')) void import('@components/Objects/Activities/Assignment/AssignmentStudentActivity')

    const warmDeferredAssets = () => {
      routesToPrefetch.forEach((href) => {
        try {
          router.prefetch(href)
        } catch (_) {}
      })
    }

    if (browserWindow.requestIdleCallback) {
      const idleId = browserWindow.requestIdleCallback(warmDeferredAssets, { timeout: 1200 })
      return () => browserWindow.cancelIdleCallback?.(idleId)
    }

    const timeoutId = browserWindow.setTimeout(warmDeferredAssets, 250)
    return () => browserWindow.clearTimeout(timeoutId)
  }, [currentChapter, course.course_uuid, courseuuid, orgslug, quickstartMode, router, loadActivityPayload])
  
  // Get previous and next activities
  const prevActivity = currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  const nextActivity = currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;
  const navigateToChapterPage = React.useCallback((page: ChapterPageLike | null, direction: 'next' | 'prev') => {
    if (!page) return
    if (activity?.id === page.activity.id) {
      setActivityTransitionDirection(direction)
      setActiveActivityPageIndex(page.pageIndex)
      return
    }
    void activateChapterActivity(page.activity, direction, page.pageIndex)
  }, [activity?.id, activateChapterActivity])

  const handleChapterBack = React.useCallback(() => {
    if (previousChapterPage) {
      navigateToChapterPage(previousChapterPage, 'prev')
      return
    }
    router.push(getUriWithOrg(orgslug, coursePath))
  }, [previousChapterPage, navigateToChapterPage, router, orgslug, coursePath])

  const handleChapterNext = React.useCallback(async () => {
    if (!activity || !currentChapterPage) return

    const cleanCourseUuid = course.course_uuid?.replace('course_', '') || courseuuid
    const shouldShowChapterComplete =
      !quickstartMode &&
      currentChapter &&
      !nextChapterPage

    if (currentChapterPage.type === 'quiz-slide') {
      if (!quizState?.isAnswered || quizState?.isSubmitting) return
      if (quizState.isShowingResponse) {
        quizPlayerRef.current?.dismissResponse()
      } else if (quizState.hasInlineResponse && quizPlayerRef.current?.showResponse()) {
        return
      }
      if (nextChapterPage?.type === 'quiz-result') {
        await quizPlayerRef.current?.submit()
      }
      if (nextChapterPage) navigateToChapterPage(nextChapterPage, 'next')
      return
    }

    if (currentChapterPage.type === 'quiz-result' && quizState?.passed === false) {
      return
    }

    if (currentChapterPage.type === 'activity') {
      try {
        await markActivityAsComplete(
          orgslug,
          course.course_uuid,
          activity.activity_uuid,
          access_token
        )
        await mutate(`${getAPIUrl()}trail/org/${org?.id}/trail`)
      } catch (_) {}
    }

    if (nextChapterPage) {
      navigateToChapterPage(nextChapterPage, 'next')
      return
    }

    if (shouldShowChapterComplete) {
      setChapterRewardVisible(true)
      return
    }

    const endPath = quickstartMode
      ? routePaths.org.quickstartCourseActivityEnd(cleanCourseUuid)
      : routePaths.org.badgePath(cleanCourseUuid)
    router.push(getUriWithOrg(orgslug, isGuestLearner ? `${endPath}?guest_completed=1` : endPath))
  }, [
    activity,
    course.course_uuid,
    courseuuid,
    quickstartMode,
    currentChapter,
    currentChapterPage,
    nextChapterPage,
    quizState?.isAnswered,
    quizState?.isSubmitting,
    quizState?.isShowingResponse,
    quizState?.hasInlineResponse,
    quizState?.passed,
    orgslug,
    access_token,
    org?.id,
    navigateToChapterPage,
    router,
    isGuestLearner,
  ])

  const retryCurrentQuiz = React.useCallback(() => {
    quizPlayerRef.current?.retry()
    setQuizState(null)
    setActiveActivityPageIndex(0)
  }, [])
  const showQuizRetry =
    currentChapterPage?.type === 'quiz-result' &&
    activity?.activity_type === 'TYPE_QUIZ' &&
    quizState?.passed === false
  const chapterNextDisabled =
    (currentChapterPage?.type === 'quiz-slide' && (!quizState?.isAnswered || quizState?.isSubmitting)) ||
    (currentChapterPage?.type === 'quiz-result' && (!quizState?.result || quizState?.passed === false))
  const chapterNextLabel = quizState?.isSubmitting
    ? 'Submitting...'
    : nextChapterPage
      ? t('common.next')
      : t('common.complete')

  // Memoize activity content
  const activityContent = useMemo(() => {
    if (!activity || !activity.published || activity.content.paid_access === false) {
      return null;
    }

    switch (activity.activity_type) {
      case 'TYPE_DYNAMIC':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Canva content={activity.content} activity={activity} />
          </Suspense>
        );
      case 'TYPE_VIDEO':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <VideoActivity course={course} activity={activity} />
          </Suspense>
        );
      case 'TYPE_DOCUMENT':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <DocumentPdfActivity course={course} activity={activity} />
          </Suspense>
        );
      case 'TYPE_ASSIGNMENT':
        return assignment ? (
          <Suspense fallback={<LoadingFallback />}>
            <AssignmentProvider assignment_uuid={assignment?.assignment_uuid}>
              <AssignmentsTaskProvider>
                <AssignmentSubmissionProvider assignment_uuid={assignment?.assignment_uuid}>
                  <AssignmentStudentActivity />
                </AssignmentSubmissionProvider>
              </AssignmentsTaskProvider>
            </AssignmentProvider>
          </Suspense>
        ) : null;
      case 'TYPE_SCORM':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ScormDisabledActivity />
          </Suspense>
        );
      case 'TYPE_QUIZ':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <QuizActivityPlayer
              ref={quizPlayerRef}
              activity={activity}
              embedded
              currentPageIndex={activeActivityPageIndex}
              onPageStateChange={setQuizState}
              onComplete={handleQuizComplete}
            />
          </Suspense>
        );
      default:
        return null;
    }
  }, [activity, course, assignment, activeActivityPageIndex, handleQuizComplete]);

  // Navigate to an activity
  const navigateToActivity = (activity: any) => {
    if (!activity) return;
    const direction = allActivities.findIndex((candidate: any) => candidate.id === activity.id) < currentIndex ? 'prev' : 'next'
    void activateChapterActivity(activity, direction);
  };

  async function getAssignmentUI() {
    if (!activity) return
    const assignment = await getAssignmentFromActivityUUID(activity.activity_uuid, access_token)
    setAssignment(assignment.data)
  }

  useEffect(() => {
    if (!activity) return
    if (activity.activity_type == 'TYPE_DYNAMIC' || activity.activity_type == 'TYPE_SCORM' || activity.activity_type == 'TYPE_QUIZ') {
      setBgColor(isFocusMode ? 'bg-white' : 'bg-white nice-shadow');
    }
    else if (activity.activity_type == 'TYPE_ASSIGNMENT') {
      setBgColor(isFocusMode ? 'bg-white' : 'bg-white nice-shadow');
      getAssignmentUI();
    }
    else {
      setBgColor(isFocusMode ? 'bg-zinc-950' : 'bg-zinc-950 nice-shadow');
    }
  }
    , [activity, pathname, isFocusMode])

  return (
    <>
      <CourseProvider courseuuid={course?.course_uuid}>
        <Suspense fallback={<LoadingFallback />}>
          <AIChatBotProvider>
            <Suspense fallback={null}>
              <AISidePanelContentWrapper>
            {isFocusMode && !isCourseEnd ? (
              <AnimatePresence>
                <motion.div
                  initial={isInitialRender.current ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="fixed inset-0 bg-white"
                  style={{ zIndex: 'var(--z-overlay)' }}
                >
                  {/* Focus Mode Top Bar */}
                  <motion.div 
                    initial={isInitialRender.current ? false : { y: -100 }}
                    animate={{ y: 0 }}
                    exit={{ y: -100 }}
                    transition={{ duration: 0.3 }}
                    className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-b border-gray-100"
                    style={{ zIndex: 'var(--z-modal-content)' }}
                  >
                    <div className="container mx-auto px-4 py-2">
                      <div className="flex items-center justify-between h-14">
                        {/* Progress Indicator - Moved to left */}
                        <motion.div 
                          initial={isInitialRender.current ? false : { opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="flex items-center space-x-2"
                        >
                          <div className="relative w-8 h-8">
                            <svg className="w-full h-full transform -rotate-90">
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                stroke="#e5e7eb"
                                strokeWidth="3"
                                fill="none"
                              />
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                stroke="#10b981"
                                strokeWidth="3"
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={2 * Math.PI * 14}
                                strokeDashoffset={2 * Math.PI * 14 * (1 - chapterProgressRatio)}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-bold text-gray-800">
                                {Math.round(visibleChapterProgressValue)}%
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-600">
                            {visibleChapterProgressLabel}
                          </div>
                        </motion.div>
                        
                        {/* Center Course Info */}
                        <motion.div 
                          initial={isInitialRender.current ? false : { opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="flex items-center space-x-4"
                        >
                          <div className="flex">
                            <Link
                              href={getUriWithOrg(orgslug, coursePath)}
                            >
                              <img
                                className="w-[60px] h-[34px] rounded-md drop-shadow-md"
                                src={course.thumbnail_image
                                  ? getCourseThumbnailMediaDirectory(
                                      org?.org_uuid,
                                      course.course_uuid,
                                      course.thumbnail_image
                                    )
                                  : '/empty_thumbnail.png'
                                }
                                alt=""
                              />
                            </Link>
                          </div>
                          <div className="flex flex-col -space-y-1">
                            <p className="font-bold text-gray-700 text-sm">{t('search.course')} </p>
                            <h1 className="font-bold text-gray-950 text-lg first-letter:uppercase">
                              {course.name}
                            </h1>
                          </div>
                        </motion.div>

                        {/* Minimize and Chapters - Moved to right */}
                        <motion.div
                          initial={isInitialRender.current ? false : { opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="flex items-center space-x-2"
                        >
                          <div className="hidden sm:block">
                            <ActivityShareDropdown
                              activityName={activity.name}
                              activityUrl={typeof window !== 'undefined' ? window.location.href : ''}
                              orgslug={orgslug}
                              courseUuid={course.course_uuid}
                              activityId={activity.activity_uuid ? activity.activity_uuid.replace('activity_', '') : activityid.replace('activity_', '')}
                              activityType={activity.activity_type}
                            />
                          </div>
                          {!quickstartMode ? (
                            <ActivityChapterDropdown
                              course={course}
                              currentActivityId={activity.activity_uuid ? activity.activity_uuid.replace('activity_', '') : activityid.replace('activity_', '')}
                              orgslug={orgslug}
                              trailData={effectiveTrailData}
                            />
                          ) : null}
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsFocusMode(false)}
                            className="bg-white nice-shadow p-2 rounded-full cursor-pointer hover:bg-gray-50"
                            title={t('activities.exit_focus_mode')}
                          >
                            <Minimize2 size={16} className="text-gray-700" />
                          </motion.button>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Focus Mode Content */}
                  <div className="pt-16 pb-20 h-full overflow-auto">
                    <div className="container mx-auto px-4">
                      {activity && activity.published == true && (
                        <>
                          {activity.content.paid_access == false ? (
                            <PaidCourseActivityDisclaimer course={course} />
                          ) : (
                            <motion.div
                              initial={isInitialRender.current ? false : { scale: 0.95, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: 0.3 }}
                              className={`${activity.activity_type === 'TYPE_SCORM' ? 'rounded-xl overflow-hidden' : 'p-7 rounded-lg'} ${bgColor} mt-4`}
                            >
                              {/* Activity Types */}
                              <div className={activity.activity_type === 'TYPE_SCORM' ? 'overflow-hidden' : ''}>
                                {activityContent}
                              </div>
                            </motion.div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Focus Mode Bottom Bar */}
                  {activity && activity.published == true && activity.content.paid_access != false && (
                    <motion.div 
                      initial={isInitialRender.current ? false : { y: 100 }}
                      animate={{ y: 0 }}
                      exit={{ y: 100 }}
                      transition={{ duration: 0.3 }}
                      className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100"
                      style={{ zIndex: 'var(--z-modal-content)' }}
                    >
                      <div className="container mx-auto px-4">
                        <div className="flex items-center justify-between h-16">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => navigateToActivity(prevActivity)}
                              className={`flex items-center space-x-1.5 p-2 rounded-md transition-all duration-200 cursor-pointer ${
                                prevActivity
                                  ? 'text-gray-700'
                                  : 'opacity-50 text-gray-400 cursor-not-allowed'
                              }`}
                              disabled={!prevActivity}
                              title={prevActivity ? `${t('common.previous')}: ${prevActivity.name}` : t('activities.no_previous_activity')}
                            >
                              <ChevronLeft size={20} className="text-gray-800 shrink-0" />
                              <div className="flex flex-col items-start">
                                <span className="text-xs text-gray-500">{t('common.previous')}</span>
                                <span className="text-sm capitalize font-semibold text-left">
                                  {prevActivity ? prevActivity.name : t('activities.no_previous_activity')}
                                </span>
                              </div>
                            </button>
                          </div>
                          <div className="flex items-center space-x-2">
                            <ActivityActions
                              activity={activity}
                              activityid={activityid}
                              course={course}
                              orgslug={orgslug}
                              assignment={assignment}
                              showNavigation={false}
                              guestMode={guestMode}
                              quickstartMode={quickstartMode}
                              publicGuestMode={publicGuestMode}
                            />
                            <button
                              onClick={() => navigateToActivity(nextActivity)}
                              className={`flex items-center space-x-1.5 p-2 rounded-md transition-all duration-200 cursor-pointer ${
                                nextActivity
                                  ? 'text-gray-700'
                                  : 'opacity-50 text-gray-400 cursor-not-allowed'
                              }`}
                              disabled={!nextActivity}
                              title={nextActivity ? `${t('common.next')}: ${nextActivity.name}` : t('activities.no_next_activity')}
                            >
                              <div className="flex flex-col items-end">
                                <span className="text-xs text-gray-500">{t('common.next')}</span>
                                <span className="text-sm capitalize font-semibold text-right">
                                  {nextActivity ? nextActivity.name : t('activities.no_next_activity')}
                                </span>
                              </div>
                              <ChevronRight size={20} className="text-gray-800 shrink-0" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : (
              <GeneralWrapperStyled>
                <div className="-m-6 flex h-dvh flex-col overflow-hidden">
                  <ContentPageHeader
                    backIcon="x"
                    backLabel={t('activities.close_activity_viewer', 'Close activity viewer')}
                    orgslug={orgslug}
                    progressLabel={visibleChapterProgressLabel}
                    progressValue={visibleChapterProgressValue}
                    onBack={showChapterCompleteReward ? closeChapterReward : closeActivityViewer}
                    noBottomMargin
                    noHorizontalBleed
                  />

                  {showChapterCompleteReward ? (
                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
                      <ChapterCompleteView
                        chapter={currentChapter}
                        course={course}
                        completedActivities={chapterCompletedActivities}
                        totalActivities={totalChapterActivities}
                        onClose={closeChapterReward}
                      />
                    </div>
                  ) : activityid === 'end' ? (
                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
                      <CourseEndView
                        courseName={course.name}
                        orgslug={orgslug}
                        courseUuid={course.course_uuid}
                        thumbnailImage={course.thumbnail_image}
                        course={course}
                        trailData={effectiveTrailData}
                        guestMode={guestMode}
                        unauthenticated={unauthenticated}
                        guestCompletedHint={guestCompletedHint}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
                        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center">
                        <div className="min-w-0 space-y-4">
                          {activity && activity.published == false && (
                            <div className="p-7 drop-shadow-xs rounded-lg bg-gray-800">
                              <div className="text-white">
                                <h1 className="font-bold text-2xl">
                                  {t('activities.not_published_yet')}
                                </h1>
                              </div>
                            </div>
                          )}

                          {activity && activity.published == true && (
                            <>
                              {activity.content.paid_access == false ? (
                                <PaidCourseActivityDisclaimer course={course} />
                              ) : (
                                <div className="flex gap-6">
                                  <div className={`flex-1 min-w-0 relative isolate ${
                                    activity.activity_type === 'TYPE_SCORM'
                                      ? 'overflow-hidden'
                                      : ''
                                  } ${activity.activity_type === 'TYPE_VIDEO' || activity.activity_type === 'TYPE_DOCUMENT' ? 'bg-zinc-950' : 'bg-transparent'}`} style={{ zIndex: 'var(--z-base)' }}>
                                    {activity.activity_type !== 'TYPE_QUIZ' && (
                                      <div className={`flex items-start justify-between gap-3 ${activity.activity_type === 'TYPE_SCORM' ? 'absolute left-4 top-4 z-10 sm:left-0 sm:top-0 sm:static sm:mb-5 sm:px-0 sm:pt-0' : 'p-0 pb-4 sm:pb-5'}`}>
                                        <div className="flex min-w-0 items-start gap-3">
                                          <div className="min-w-0">
                                            <h1 className="min-w-0 font-bold text-gray-950 text-2xl first-letter:uppercase sm:text-3xl">
                                              {activity.name}
                                            </h1>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    <AnimatePresence mode="popLayout" initial={false}>
                                      <motion.div
                                        key={activity?.activity_uuid || activityid}
                                        initial={{ opacity: 0, y: activityTransitionDirection === 'next' ? 28 : -28 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: activityTransitionDirection === 'next' ? -28 : 28 }}
                                        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                                      >
                                        {activityContent}
                                      </motion.div>
                                    </AnimatePresence>
                                  </div>
                                  <Suspense fallback={null}>
                                    <AISidePanelInline activity={activity} />
                                  </Suspense>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      </div>

                    {activity && activity.published == true && activity.content.paid_access != false && (
                      <div className="shrink-0 border-t border-gray-200 px-6 py-4">
                        <div className="mx-auto flex w-full max-w-5xl flex-row items-stretch justify-between gap-2 sm:items-center">
                          <div className="min-w-0 flex-1 sm:flex-none">
                            {showQuizRetry ? (
                              <button
                                type="button"
                                onClick={retryCurrentQuiz}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-50 sm:w-auto"
                              >
                                <ChevronLeft size={17} />
                                Retry
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleChapterBack}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-50 sm:w-auto"
                              >
                                <ChevronLeft size={17} />
                                {t('common.back', 'Back')}
                              </button>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-1 items-stretch justify-end gap-2 sm:flex-none">
                            {activity.activity_type !== 'TYPE_QUIZ' && (
                              <ActivityActions
                                activity={activity}
                                activityid={activityid}
                                course={course}
                                orgslug={orgslug}
                                assignment={assignment}
                                showNavigation={false}
                                guestMode={guestMode}
                                publicGuestMode={publicGuestMode}
                                quickstartMode={quickstartMode}
                              />
                            )}
                            <button
                              type="button"
                              onClick={handleChapterNext}
                              disabled={chapterNextDisabled}
                              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 sm:w-auto"
                            >
                              {chapterNextLabel}
                              <ChevronRight size={17} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    </>
                  )}
                </div>
              </GeneralWrapperStyled>
            )}
              </AISidePanelContentWrapper>
            </Suspense>
          </AIChatBotProvider>
        </Suspense>
      </CourseProvider>
    </>
  )
}

function ChapterCompleteView({
  chapter,
  course,
  completedActivities,
  totalActivities,
  onClose,
}: {
  chapter: any
  course: any
  completedActivities: number
  totalActivities: number
  onClose: () => void
}) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-green-600 ring-1 ring-green-100">
          <Award size={38} strokeWidth={1.7} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-green-600">
          Chapter complete
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-gray-950">
          {chapter?.name || 'Nice work'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500">
          You finished {completedActivities}/{totalActivities} activities in this chapter of {course.name}.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-7 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
        >
          Back to path
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  )
}

function NextActivityButton({ course, currentActivityId, activity, orgslug, guestMode = false, publicGuestMode = false, quickstartMode = false }: { course: any, currentActivityId: string, activity: any, orgslug: string, guestMode?: boolean, publicGuestMode?: boolean, quickstartMode?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useLHSession() as any;
  const org = useOrg() as any;
  const { isUserPartOfTheOrg } = useOrgMembership();
  const [isLoading, setIsLoading] = React.useState(false);
  const isGuestLearner = guestMode || publicGuestMode;

  const findNextActivity = () => {
    let allActivities: any[] = [];
    let currentIndex = -1;

    course.chapters.forEach((chapter: any) => {
      chapter.activities.forEach((act: any) => {
        const cleanActivityUuid = act.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...act,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name,
          chapterId: chapter.id,
          chapterUuid: chapter.chapter_uuid
        });

        if (act.id === currentActivityId) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    return currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;
  };

  const nextActivity = findNextActivity();
  const currentChapter = findChapterForActivity(course, currentActivityId)
  const nextActivityIsInCurrentChapter =
    nextActivity &&
    currentChapter &&
    nextActivity.chapterId === currentChapter.id
  const shouldShowChapterComplete =
    !quickstartMode &&
    currentChapter &&
    (!nextActivity || !nextActivityIsInCurrentChapter)

  // Only show for org members or guest mode
  if (!isGuestLearner && !isUserPartOfTheOrg) return null;

  const handleNext = async () => {
    setIsLoading(true);
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    const currentActivityPath = quickstartMode
      ? routePaths.org.quickstartCourseActivity(cleanCourseUuid, activity.activity_uuid?.replace('activity_', '') || '')
      : routePaths.org.courseActivity(cleanCourseUuid, activity.activity_uuid?.replace('activity_', '') || '')
    const chapterCompletePath = shouldShowChapterComplete
      ? `${currentActivityPath}?chapter_complete=${currentChapter.chapter_uuid || currentChapter.id}`
      : null
    const baseNextActivityPath = chapterCompletePath || (nextActivity
      ? (quickstartMode
        ? routePaths.org.quickstartCourseActivity(cleanCourseUuid, nextActivity.cleanUuid)
        : routePaths.org.courseActivity(cleanCourseUuid, nextActivity.cleanUuid))
      : (quickstartMode
        ? routePaths.org.quickstartCourseActivityEnd(cleanCourseUuid)
        : routePaths.org.courseActivityEnd(cleanCourseUuid)));
    const nextActivityPath =
      !chapterCompletePath && !nextActivity && isGuestLearner
        ? `${baseNextActivityPath}?guest_completed=1`
        : baseNextActivityPath

    try {
      if (!(activity.activity_type === 'TYPE_QUIZ' && activity.details?.quiz_mode === 'graded')) {
        await markActivityAsComplete(
          orgslug,
          course.course_uuid,
          activity.activity_uuid,
          session.data?.tokens?.access_token
        );
        await mutate(`${getAPIUrl()}trail/org/${org?.id}/trail`);
      }
    } catch (_) {
      // Continue navigation even if marking fails
    }

    router.push(getUriWithOrg(orgslug, nextActivityPath));
    setIsLoading(false);
  };

  if (!nextActivity || shouldShowChapterComplete) {
    return (
      <button
        type="button"
        onClick={!isLoading ? handleNext : undefined}
        disabled={isLoading}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {t('common.complete')}
        <ChevronRight size={17} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={!isLoading ? handleNext : undefined}
      disabled={isLoading}
      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
    >
      {t('common.next')}
      <ChevronRight size={17} />
    </button>
  );
}

function PreviousActivityButton({ course, currentActivityId, orgslug, guestMode = false, quickstartMode = false }: { course: any, currentActivityId: string, orgslug: string, guestMode?: boolean, quickstartMode?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();

  const findPreviousActivity = () => {
    let allActivities: any[] = [];
    let currentIndex = -1;

    // Flatten all activities from all chapters
    course.chapters.forEach((chapter: any) => {
      chapter.activities.forEach((activity: any) => {
        const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...activity,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name
        });

        // Check if this is the current activity
        if (activity.id === currentActivityId) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    // Get previous activity
    return currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  };

  const previousActivity = findPreviousActivity();

  if (!previousActivity) return null;

  const navigateToActivity = () => {
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    const previousActivityPath = quickstartMode
      ? routePaths.org.quickstartCourseActivity(cleanCourseUuid, previousActivity.cleanUuid)
      : routePaths.org.courseActivity(cleanCourseUuid, previousActivity.cleanUuid)
    router.push(getUriWithOrg(orgslug, previousActivityPath));
  };

  return (
    <button
      type="button"
      onClick={navigateToActivity}
      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-50 sm:w-auto"
    >
      <ChevronLeft size={17} />
      {t('common.back', 'Back')}
    </button>
  );
}

function AssignmentTools(props: {
  activity: any
  activityid: string
  course: any
  orgslug: string
  assignment: any
}) {
  const { t } = useTranslation();
  const submission = useAssignmentSubmission() as any
  const session = useLHSession() as any;
  const [finalGrade, setFinalGrade] = React.useState(null) as any;

  const submitForGradingUI = async () => {
    if (props.assignment) {
      const res = await submitAssignmentForGrading(
        props.assignment?.assignment_uuid,
        session.data?.tokens?.access_token
      )
      if (res.success) {
        toast.success(t('assignments.assignment_submitted_success'))
        mutate(`${getAPIUrl()}assignments/${props.assignment?.assignment_uuid}/submissions/me`,)
      }
      else {
        toast.error(t('assignments.failed_submit_assignment'))
      }
    }
  }

  const getGradingBasedOnMethod = async () => {
    const res = await getFinalGrade(
      session.data?.user?.id,
      props.assignment?.assignment_uuid,
      session.data?.tokens?.access_token
    );

    if (res.success) {
      const { grade, max_grade, grading_type } = res.data;
      let displayGrade;

      switch (grading_type) {
        case 'ALPHABET':
          displayGrade = convertNumericToAlphabet(grade, max_grade);
          break;
        case 'NUMERIC':
          displayGrade = `${grade}/${max_grade}`;
          break;
        case 'PERCENTAGE':
          const percentage = (grade / max_grade) * 100;
          displayGrade = `${percentage.toFixed(2)}%`;
          break;
        default:
          displayGrade = 'Unknown grading type';
      }

      // Use displayGrade here, e.g., update state or display it
      setFinalGrade(displayGrade);
    } else {
    }
  };

  // Helper function to convert numeric grade to alphabet grade
  function convertNumericToAlphabet(grade: any, maxGrade: any) {
    const percentage = (grade / maxGrade) * 100;
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  }

  useEffect(() => {
    if ( submission && submission.length > 0 && submission[0].submission_status === 'GRADED') {
      getGradingBasedOnMethod();
    }
  }
    , [submission, props.assignment])

  if (!submission || submission.length === 0) {
    return (
      <ConfirmationModal
        confirmationButtonText={t('assignments.submit_assignment')}
        confirmationMessage={t('assignments.submit_assignment_confirm')}
        dialogTitle={t('assignments.submit_assignment_title')}
        dialogTrigger={
          <div className="bg-cyan-800 rounded-md px-4 nice-shadow flex flex-col p-2.5 text-white hover:cursor-pointer transition delay-150 duration-300 ease-in-out">
            <span className="text-[10px] font-bold mb-1 uppercase">{t('common.status')}</span>
            <div className="flex items-center space-x-2">
              <BookOpenCheck size={17} />
              <span className="text-xs font-bold">{t('assignments.submit_for_grading')}</span>
            </div>
          </div>
        }
        functionToExecute={submitForGradingUI}
        status="info"
      />
    )
  }

  if (submission[0].submission_status === 'SUBMITTED') {
    return (
      <div className="bg-amber-800 rounded-md px-4 nice-shadow flex flex-col p-2.5 text-white transition delay-150 duration-300 ease-in-out">
        <span className="text-[10px] font-bold mb-1 uppercase">{t('common.status')}</span>
        <div className="flex items-center space-x-2">
          <UserRoundPen size={17} />
          <span className="text-xs font-bold">{t('assignments.grading_in_progress')}</span>
        </div>
      </div>
    )
  }

  if (submission[0].submission_status === 'GRADED') {
    return (
      <div className="bg-teal-600 rounded-md px-4 nice-shadow flex flex-col p-2.5 text-white transition delay-150 duration-300 ease-in-out">
        <span className="text-[10px] font-bold mb-1 uppercase">{t('common.status')}</span>
        <div className="flex items-center space-x-2">
          <CheckCircle size={17} />
          <span className="text-xs flex space-x-2 font-bold items-center">
            <span>{t('assignments.graded')} </span>
            <span className='bg-white text-teal-800 px-1 py-0.5 rounded-md'>{finalGrade}</span>
          </span>
        </div>
      </div>
    )
  }

  // Default return in case none of the conditions are met
  return null
}

export default ActivityClient
