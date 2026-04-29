'use client'
import Link from 'next/link'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { AlertTriangle, BookOpenCheck, CheckCircle, ChevronLeft, ChevronRight, UserRoundPen, Edit2, Minimize2 } from 'lucide-react'
import { markActivityAsComplete, startCourse } from '@services/courses/activity'
import {
  findCourseRun,
  getCompletedCourseStepCount,
} from '@services/courses/progress'
import { usePathname, useRouter } from 'next/navigation'
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
import ActivityCourseOutline from '@components/Pages/Activity/ActivityCourseOutline'
import CourseEndView from '@components/Pages/Activity/CourseEndView'
import ActivityHeader from '@components/Pages/Activity/ActivityHeader'
import { motion, AnimatePresence } from 'motion/react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { useTranslation } from 'react-i18next'
import { useAnalytics } from '@/hooks/useAnalytics'
import { Dialog, DialogContent } from '@components/ui/dialog'

// Lazy load heavy components
const Canva = lazy(() => import('@components/Objects/Activities/DynamicCanva/DynamicCanva'))
const VideoActivity = lazy(() => import('@components/Objects/Activities/Video/Video'))
const DocumentPdfActivity = lazy(() => import('@components/Objects/Activities/DocumentPdf/DocumentPdf'))
const AssignmentStudentActivity = lazy(() => import('@components/Objects/Activities/Assignment/AssignmentStudentActivity'))
const AISidePanelContentWrapper = lazy(() => import('@components/Objects/Activities/AI/AIActivityAsk').then(mod => ({ default: mod.AISidePanelContentWrapper })))
const AISidePanelInline = lazy(() => import('@components/Objects/Activities/AI/AIActivityAsk').then(mod => ({ default: mod.AISidePanelInline })))
const AIChatBotProvider = lazy(() => import('@components/Contexts/AI/AIChatBotContext'))
const QuizLaunchButton = lazy(() => import('@components/Objects/Activities/Quiz/Player/QuizLaunchButton'))
const QuizTitleActions = lazy(() => import('@components/Objects/Activities/Quiz/Player/QuizTitleActions'))

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
          chapterName: chapter.name
        });
        
        if (cleanActivityUuid === activityId.replace('activity_', '')) {
          currentIndex = allActivities.length - 1;
        }
      });
    });
    
    return { allActivities, currentIndex };
  }, [course, activityId]);
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
  const activityid = props.activityid
  const guestMode = props.guestMode === true
  const unauthenticated = props.unauthenticated === true
  const guestCompletedHint = props.guestCompletedHint === true
  const quickstartMode = props.quickstartMode === true
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
  const activity = props.activity
  const course = props.course
  const org = useOrg() as any
  const { isUserPartOfTheOrg } = useOrgMembership()
  const session = useLHSession() as any;
  const pathname = usePathname()
  const access_token = session?.data?.tokens?.access_token;
  const [bgColor, setBgColor] = React.useState('bg-white')
  const [assignment, setAssignment] = React.useState(null) as any;
  const [isFocusMode, setIsFocusMode] = React.useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = React.useState(false);
  const [isDesktopOutlineOpen, setIsDesktopOutlineOpen] = React.useState(true);
  const isInitialRender = useRef(true);
  const hasAttemptedGuestCourseStart = useRef(false)
  const hasAttemptedCourseStart = useRef(false)
  const router = useRouter();

  const { track } = useAnalytics()
  const activityStartTime = useRef(Date.now())

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
  const coursePath = quickstartMode
    ? routePaths.org.quickstartCourse(courseuuid)
    : routePaths.org.course(courseuuid)
  const buildActivityPath = (activityUuid: string) =>
    quickstartMode
      ? routePaths.org.quickstartCourseActivity(courseuuid, activityUuid)
      : routePaths.org.courseActivity(courseuuid, activityUuid)
  
  // Get previous and next activities
  const prevActivity = currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  const nextActivity = currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;

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
            <QuizLaunchButton activity={activity} />
          </Suspense>
        );
      default:
        return null;
    }
  }, [activity, course, assignment]);

  // Navigate to an activity
  const navigateToActivity = (activity: any) => {
    if (!activity) return;
    const activityPath = buildActivityPath(activity.cleanUuid)
    router.push(getUriWithOrg(orgslug, activityPath));
  };

  // Initialize focus mode from localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('globalFocusMode');
      setIsFocusMode(saved === 'true');
    }
  }, []);

  // Save focus mode to localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('globalFocusMode', isFocusMode.toString());
      // Dispatch custom event for focus mode change
      window.dispatchEvent(new CustomEvent('focusModeChange', { 
        detail: { isFocusMode } 
      }));
      isInitialRender.current = false;
    }
  }, [isFocusMode]);

  async function getAssignmentUI() {
    const assignment = await getAssignmentFromActivityUUID(activity.activity_uuid, access_token)
    setAssignment(assignment.data)
  }

  useEffect(() => {
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
            {isFocusMode ? (
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
                                strokeDashoffset={2 * Math.PI * 14 * (1 - progressRatio)}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-bold text-gray-800">
                                {Math.round(progressRatio * 100)}%
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-600">
                            {completedCourseActivities} {t('common.of')} {totalCourseActivities}
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
                {/* Original non-focus mode UI */}
                {activityid === 'end' ? (
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
                ) : (
                  <div className="space-y-4 relative">
                    <ActivityHeader
                      course={course}
                      activity={activity}
                      activityid={activityid}
                      courseuuid={courseuuid}
                      orgslug={orgslug}
                      trailData={effectiveTrailData}
                      onOpenOutline={() => setIsOutlineOpen(true)}
                      onToggleDesktopSidebar={() => setIsDesktopOutlineOpen((open) => !open)}
                      disableOutlineAccess={quickstartMode}
                    />
                    {!quickstartMode ? (
                      <Dialog open={isOutlineOpen} onOpenChange={setIsOutlineOpen}>
                        <DialogContent className="left-0 right-0 bottom-0 top-auto mt-16 max-h-[calc(100dvh-4rem)] max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none border-x-0 border-b-0 border-t border-gray-200 bg-white px-0 pb-0 pt-3 sm:rounded-t-[28px] lg:hidden">
                          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-200" />
                          <div className="min-h-0 overflow-hidden px-4 pb-5 sm:px-5">
                            <ActivityCourseOutline
                              course={course}
                              currentActivityId={activityid}
                              orgslug={orgslug}
                              trailData={effectiveTrailData}
                              courseHref={coursePath}
                              getActivityHref={buildActivityPath}
                              variant="sheet"
                              autoScrollToHighlighted
                              onNavigate={() => setIsOutlineOpen(false)}
                              initialExpandedActivityId={activityid}
                            />
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : null}

                    <div className={`grid gap-6 lg:items-start ${!quickstartMode && isDesktopOutlineOpen ? 'lg:grid-cols-[260px_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)]'}`}>
                      <aside className={`${!quickstartMode && isDesktopOutlineOpen ? 'hidden lg:block' : 'hidden'}`}>
                        <div className="sticky top-28">
                          <ActivityCourseOutline
                            course={course}
                            currentActivityId={activityid}
                            orgslug={orgslug}
                            trailData={effectiveTrailData}
                            courseHref={coursePath}
                            getActivityHref={buildActivityPath}
                            variant="sidebar"
                            onCloseSidebar={() => setIsDesktopOutlineOpen(false)}
                            initialExpandedActivityId={activityid}
                          />
                        </div>
                      </aside>

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
                                    ? '-mx-4 overflow-hidden rounded-none sm:mx-0 sm:rounded-xl'
                                    : '-mx-4 rounded-none px-5 pb-6 pt-5 sm:mx-0 sm:rounded-lg sm:p-7 drop-shadow-xs'
                                } ${bgColor}`} style={{ zIndex: 'var(--z-base)' }}>
                                  {/*
                                  <button
                                    onClick={() => setIsFocusMode(true)}
                                    className={`absolute ${activity.activity_type === 'TYPE_SCORM' ? 'top-2 right-2' : 'top-4 right-4'} hidden sm:flex bg-white/80 hover:bg-white nice-shadow p-2 rounded-full cursor-pointer transition-all duration-200 group overflow-hidden pointer-events-auto`}
                                    style={{ zIndex: 'var(--z-interactive)' }}
                                    title={t('activities.focus_mode')}
                                  >
                                    <div className="flex items-center">
                                      <Maximize2 size={16} className="text-gray-700" />
                                      <span className="text-xs font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-all duration-200 w-0 group-hover:w-auto group-hover:ml-2 whitespace-nowrap">
                                        {t('activities.focus_mode')}
                                      </span>
                                    </div>
                                  </button>
                                  */}
                                  <div className={`flex items-start justify-between gap-3 ${activity.activity_type === 'TYPE_SCORM' ? 'absolute left-4 top-4 z-10 sm:left-0 sm:top-0 sm:static sm:mb-5 sm:px-0 sm:pt-0' : 'p-0 pb-4 sm:pb-5'}`}>
                                    <h1 className="min-w-0 font-bold text-gray-950 text-2xl first-letter:uppercase sm:text-3xl">
                                      {activity.name}
                                    </h1>
                                    {activity.activity_type === 'TYPE_QUIZ' && (
                                      <Suspense fallback={null}>
                                        <QuizTitleActions activity={activity} />
                                      </Suspense>
                                    )}
                                  </div>
                                  {activityContent}
                                </div>
                                <Suspense fallback={null}>
                                  <AISidePanelInline activity={activity} />
                                </Suspense>
                              </div>
                            )}
                          </>
                        )}

                        {activity && activity.published == true && activity.content.paid_access != false && (
                          <div className="mt-4 flex w-full flex-row items-stretch justify-between gap-2 sm:items-center">
                            <div className="min-w-0 flex-1 sm:flex-none">
                              <PreviousActivityButton
                                course={course}
                                currentActivityId={activity.id}
                                orgslug={orgslug}
                                guestMode={guestMode}
                                quickstartMode={quickstartMode}
                              />
                            </div>
                            <div className="flex min-w-0 flex-1 items-stretch justify-end gap-2 sm:flex-none">
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
                              <NextActivityButton
                                course={course}
                                currentActivityId={activity.id}
                                activity={activity}
                                orgslug={orgslug}
                                guestMode={guestMode}
                                publicGuestMode={publicGuestMode}
                                quickstartMode={quickstartMode}
                              />
                            </div>
                          </div>
                        )}

                        <div style={{ height: '100px' }}></div>
                      </div>
                    </div>
                  </div>
                )}
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
          chapterName: chapter.name
        });

        if (act.id === currentActivityId) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    return currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;
  };

  const nextActivity = findNextActivity();

  // Only show for org members or guest mode
  if (!isGuestLearner && !isUserPartOfTheOrg) return null;

  const handleNext = async () => {
    setIsLoading(true);
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    const baseNextActivityPath = nextActivity
      ? (quickstartMode
        ? routePaths.org.quickstartCourseActivity(cleanCourseUuid, nextActivity.cleanUuid)
        : routePaths.org.courseActivity(cleanCourseUuid, nextActivity.cleanUuid))
      : (quickstartMode
        ? routePaths.org.quickstartCourseActivityEnd(cleanCourseUuid)
        : routePaths.org.courseActivityEnd(cleanCourseUuid));
    const nextActivityPath =
      !nextActivity && isGuestLearner
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

  if (!nextActivity) {
    // Last activity — show Finish Course button
    return (
      <div
        onClick={!isLoading ? handleNext : undefined}
        className={`bg-teal-600 rounded-md px-3 sm:px-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] flex min-w-0 w-full sm:w-[220px] flex-col p-2 sm:p-2.5 text-white hover:cursor-pointer transition delay-150 duration-300 ease-in-out hover:bg-teal-700 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        <span className="text-[10px] font-bold text-white/70 mb-1 uppercase">{t('common.complete')}</span>
        <div className="flex items-center space-x-1">
          <span className="text-xs sm:text-sm font-semibold truncate">{course.name}</span>
          <ChevronRight size={17} className="shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={!isLoading ? handleNext : undefined}
      className={`bg-primary rounded-md px-3 sm:px-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] flex min-w-0 w-full sm:w-[220px] flex-col p-2 sm:p-2.5 text-primary-foreground hover:cursor-pointer transition delay-150 duration-300 ease-in-out hover:bg-primary/90 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      <span className="text-[10px] font-bold text-primary-foreground/70 mb-1 uppercase">{t('common.next')}</span>
      <div className="flex items-center space-x-1">
        <span className="text-xs sm:text-sm font-semibold truncate max-w-[120px] sm:max-w-[200px]">{nextActivity.name}</span>
        <ChevronRight size={17} className="shrink-0" />
      </div>
    </div>
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
    <div
      onClick={navigateToActivity}
      className="bg-white rounded-md px-3 sm:px-4 nice-shadow flex min-w-0 w-full sm:w-[220px] flex-col p-2 sm:p-2.5 text-gray-600 hover:cursor-pointer transition delay-150 duration-300 ease-in-out"
    >
      <span className="text-[10px] font-bold text-gray-500 mb-1 uppercase">{t('common.previous')}</span>
      <div className="flex items-center space-x-1">
        <ChevronLeft size={17} className="shrink-0" />
        <span className="text-xs sm:text-sm font-semibold truncate max-w-[120px] sm:max-w-[200px]">{previousActivity.name}</span>
      </div>
    </div>
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
