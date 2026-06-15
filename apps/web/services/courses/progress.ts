type TrailStepLike = {
  activity_id?: number | null
  course_id?: number | null
  complete?: boolean | null
  data?: {
    course?: {
      id?: number | null
      course_uuid?: string | null
      uuid?: string | null
    } | null
  } | null
}

type TrailRunLike = {
  course_id?: number | null
  course_uuid?: string | null
  course?: {
    id?: number | null
    course_uuid?: string | null
    uuid?: string | null
  } | null
  steps?: TrailStepLike[] | null
}

type CourseChapterLike = {
  id?: number | null
  chapter_uuid?: string | null
  name?: string | null
  activities?: Array<{
    id?: number | null
    activity_uuid?: string | null
    activity_type?: string | null
    content?: any
  }>
}

type CourseLike = {
  id?: number | null
  course_uuid?: string | null
  chapters?: CourseChapterLike[]
}

function stripCoursePrefix(value?: string | null) {
  if (!value) return null
  return value.replace('course_', '')
}

function getRunCourseUuid(run?: TrailRunLike | null) {
  if (!run) return null

  return stripCoursePrefix(
    run.course_uuid ||
      run.course?.course_uuid ||
      run.course?.uuid ||
      run.steps?.[0]?.data?.course?.course_uuid ||
      run.steps?.[0]?.data?.course?.uuid ||
      null
  )
}

function getRunCourseId(run?: TrailRunLike | null) {
  if (!run) return null

  return (
    run.course_id ||
    run.course?.id ||
    run.steps?.[0]?.course_id ||
    run.steps?.[0]?.data?.course?.id ||
    null
  )
}

export function findCourseRun(
  trailData: { runs?: TrailRunLike[] | null } | null | undefined,
  course: CourseLike | null | undefined
) {
  const runs = trailData?.runs || []
  const targetCourseUuid = stripCoursePrefix(course?.course_uuid)
  const targetCourseId = course?.id ?? null

  return (
    runs.find((run) => {
      const runCourseUuid = getRunCourseUuid(run)
      if (targetCourseUuid && runCourseUuid === targetCourseUuid) return true

      const runCourseId = getRunCourseId(run)
      if (targetCourseId && runCourseId === targetCourseId) return true

      return false
    }) || null
  )
}

export function isTrailStepCompleted(step?: TrailStepLike | null) {
  return Boolean(step && step.complete !== false)
}

export function isCourseActivityCompleted(
  run: TrailRunLike | null | undefined,
  activityId: number | null | undefined
) {
  if (!run || !activityId) return false

  return Boolean(
    run.steps?.find(
      (step) => step.activity_id === activityId && isTrailStepCompleted(step)
    )
  )
}

export function getCompletedCourseStepCount(run: TrailRunLike | null | undefined) {
  if (!run?.steps?.length) return 0
  return run.steps.filter((step) => isTrailStepCompleted(step)).length
}

export function getCourseCompletionSummary(
  course: CourseLike | null | undefined,
  run: TrailRunLike | null | undefined
) {
  const allActivities =
    course?.chapters?.flatMap((chapter) => chapter.activities || []) || []

  const totalActivities = allActivities.length
  const completedActivities = allActivities.filter((activity) =>
    isCourseActivityCompleted(run, activity.id)
  ).length

  return {
    totalActivities,
    completedActivities,
    isCompleted:
      totalActivities > 0 && completedActivities >= totalActivities,
  }
}

export function getCourseChapterCompletionSummary(
  course: CourseLike | null | undefined,
  run: TrailRunLike | null | undefined
) {
  const chapters = course?.chapters?.filter((chapter) => (chapter.activities || []).length > 0) || []
  const totalChapters = chapters.length
  const completedChapters = chapters.filter((chapter) =>
    getChapterCompletionSummary(chapter, run).isCompleted
  ).length
  const startedChapters = chapters.filter((chapter) =>
    getChapterCompletionSummary(chapter, run).isStarted
  ).length

  return {
    totalChapters,
    completedChapters,
    startedChapters,
    isStarted: startedChapters > 0,
    isCompleted:
      totalChapters > 0 && completedChapters >= totalChapters,
  }
}

export function getChapterCompletionSummary(
  chapter: CourseChapterLike | null | undefined,
  run: TrailRunLike | null | undefined
) {
  const activities = chapter?.activities || []
  const totalActivities = activities.length
  const completedActivities = activities.filter((activity) =>
    isCourseActivityCompleted(run, activity.id)
  ).length

  return {
    totalActivities,
    completedActivities,
    isStarted: completedActivities > 0,
    isCompleted:
      totalActivities > 0 && completedActivities >= totalActivities,
  }
}

export function findChapterForActivity(
  course: CourseLike | null | undefined,
  activityId: number | string | null | undefined
) {
  if (!course?.chapters?.length || activityId === null || activityId === undefined) {
    return null
  }

  const cleanActivityUuid =
    typeof activityId === 'string'
      ? activityId.replace('activity_', '')
      : null

  return (
    course.chapters.find((chapter) =>
      (chapter.activities || []).some((activity) => {
        if (typeof activityId === 'number' && activity.id === activityId) return true
        return activity.activity_uuid?.replace('activity_', '') === cleanActivityUuid
      })
    ) || null
  )
}

export type ChapterPageLike = {
  type: 'activity' | 'quiz-question' | 'quiz-result'
  activity: NonNullable<CourseChapterLike['activities']>[number]
  pageIndex: number
  pageCount: number
}

export function getQuizQuestionCount(content: any) {
  let count = 0
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (
      node.type === 'quizSelectBlock' ||
      node.type === 'quizMultiSelectBlock' ||
      node.type === 'quizTextBlock' ||
      node.type === 'quizSliderBlock' ||
      node.type === 'quizSortBlock'
    ) {
      count += 1
    }
    if (Array.isArray(node.content)) node.content.forEach(visit)
  }
  visit(content)
  return count
}

export function getActivityPageCount(activity: NonNullable<CourseChapterLike['activities']>[number]) {
  if (activity?.activity_type !== 'TYPE_QUIZ') return 1
  return Math.max(1, getQuizQuestionCount(activity.content)) + 1
}

export function expandChapterPages(chapter: CourseChapterLike | null | undefined): ChapterPageLike[] {
  const pages: ChapterPageLike[] = []
  ;(chapter?.activities || []).forEach((activity) => {
    const pageCount = getActivityPageCount(activity)
    if (activity.activity_type !== 'TYPE_QUIZ') {
      pages.push({ type: 'activity', activity, pageIndex: 0, pageCount })
      return
    }
    const questionCount = Math.max(1, pageCount - 1)
    for (let pageIndex = 0; pageIndex < questionCount; pageIndex += 1) {
      pages.push({ type: 'quiz-question', activity, pageIndex, pageCount })
    }
    pages.push({ type: 'quiz-result', activity, pageIndex: questionCount, pageCount })
  })
  return pages
}

export function getChapterPageProgress(
  chapter: CourseChapterLike | null | undefined,
  activityId: number | string | null | undefined,
  activityPageIndex = 0
) {
  const pages = expandChapterPages(chapter)
  const cleanActivityUuid =
    typeof activityId === 'string' ? activityId.replace('activity_', '') : null
  const clampedActivityPageIndex = Math.max(0, activityPageIndex)
  const currentIndex = pages.findIndex((page) => {
    const matchesActivity =
      typeof activityId === 'number'
        ? page.activity.id === activityId
        : page.activity.activity_uuid?.replace('activity_', '') === cleanActivityUuid
    return matchesActivity && page.pageIndex === clampedActivityPageIndex
  })

  return {
    pages,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
    totalPages: pages.length,
    currentPageNumber: pages.length > 0 ? (currentIndex >= 0 ? currentIndex + 1 : 1) : 0,
  }
}
